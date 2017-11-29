import * as cheerio from 'cheerio';
import { URL } from 'url';
import { replaceSmartQuotes } from './helpers';
import { last } from 'lodash';
import { format, parse } from 'date-fns';

type Piece = {
  type: 'sentence' | 'quote' | 'heading';
  text: string;
  sourceUrl?: string;
  sourceTitle?: string;
  sourceName?: string;
};

type ScrapeResult = {
  notablePerson: {
    name: string;
    tags: string[];
  };
  relatedPeople: Array<{
    slug: string;
    name: string;
  }>;
  article: {
    author: string;
    lastUpdatedOn?: string;
    summary: {
      religion?: string;
      politicalViews?: string;
    };
    content: Piece[];
  };
};

function scrapeText($: CheerioStatic, e: CheerioElement) {
  let text = '';
  let sourceUrl;
  let sourceTitle;
  const content = [];
  for (const node of e.childNodes) {
    if (node.type === 'text') {
      text += node.nodeValue;
    } else if (node.type === 'tag' && node.tagName === 'sup') {
      const $sup = $(node);
      const id = $sup.find('a').attr('href');
      const $a = $.root()
        .find(id)
        .find('a:first-of-type');
      sourceUrl = $a.attr('href');
      sourceTitle = $a.text() || undefined;

      content.push({ text, sourceUrl, sourceTitle });
      sourceUrl = undefined;
      sourceTitle = undefined;
      text = '';
      continue;
    }

    if (node === last(e.childNodes)) {
      content.push({ text, sourceUrl, sourceTitle });
      sourceUrl = undefined;
      sourceTitle = undefined;
      text = '';
    }
  }

  return (
    content
      // tslint:disable-next-line:no-shadowed-variable
      .map(({ sourceTitle, sourceUrl, text }) => ({
        sourceUrl,
        sourceTitle:
          sourceTitle !== undefined
            ? replaceSmartQuotes(sourceTitle)
            : undefined,
        text: replaceSmartQuotes(text.trim()),
      }))
      .filter(v => v.text)
  );
}

// tslint:disable-next-line:max-func-body-length
export async function scrapeHtml(html: string): Promise<ScrapeResult> {
  const $ = cheerio.load(html);

  const name = $.root()
    .find('.header-image h1')
    .text()
    .replace('The religion and political views of', '')
    .trim();

  const religion =
    $.root()
      .find('.hollowverse-summary h2:nth-of-type(1)')
      .next('p')
      .text()
      .trim() || undefined;

  const politicalViews =
    $.root()
      .find('.hollowverse-summary h2:nth-of-type(2)')
      .next('p')
      .text()
      .trim() || undefined;

  const content: ScrapeResult['article']['content'] = [];

  $.root()
    .find('#ingrown-sidebar')
    .remove();

  $.root()
    .find('.entry-content')
    .find('> p, h2, blockquote')
    .each((_, e) => {
      const type =
        e.tagName === 'p'
          ? 'sentence'
          : e.tagName === 'blockquote' ? 'quote' : 'heading';
      if (type === 'quote') {
        $(e)
          .find('p')
          .each((__, p) => {
            scrapeText($, p).forEach(v => {
              content.push({ type, ...v });
            });
          });
      } else {
        scrapeText($, e).forEach(v => {
          content.push({ type, ...v });
        });
      }
    });

  const tags = $.root()
    .find('article')
    .attr('class')
    .split(' ')
    .filter(c => c.startsWith('tag-'))
    .map(c => c.replace('tag-', ''));

  const author = $.root()
    .find('.thv-posted-on > p > a:first-of-type')
    .text()
    .trim();

  const match = $.root()
    .find('.thv-posted-on > p')
    .text()
    .match(/last updated on (.+)\.\s.+$/i);

  let lastUpdatedOn: string | undefined;
  if (match && match[1]) {
    lastUpdatedOn = format(parse(match[1]), 'YYYY-MM-DD');
  }

  const relatedPeople: ScrapeResult['relatedPeople'] = [];

  $.root()
    .find('#similar-posts a')
    .each((_, a) => {
      const $a = $(a);
      relatedPeople.push({
        slug: new URL($a.attr('href')).pathname.replace(/[\/\\]/gi, ''),
        name: $a.find('h1').text(),
      });
    });

  return {
    notablePerson: {
      name,
      tags,
    },
    relatedPeople,
    article: {
      lastUpdatedOn,
      author,
      summary: {
        politicalViews,
        religion,
      },
      content,
    },
  };
}
