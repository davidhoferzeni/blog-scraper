import puppeteer, { Browser, ElementHandle } from 'puppeteer';
import blogconfig from '../blogconfig.json' assert { type: 'json' };
import { XMLParser } from 'fast-xml-parser';
import Epub from 'epub-gen';
import fs from 'fs';
import path from 'path';

/**
 * @param {string} url
 * @param {ElementHandle} article
 */
async function updateImages(url, article) {
    const images = await article.$$eval(
        'img',
        (imageElements, currentUrl) => {
            imageElements.forEach((imageElement) => {
                const webpageUrl = new URL(imageElement.src, currentUrl);
                imageElement.src = webpageUrl.toString();
            });
        },
        url
    );
}

/**
 * My cool function.
 * @param {Object} b - Blog object.
 * @param {string} b.url
 * @param {string} b.titleSelector
 * @param {string} b.articleSelector
 * @param {string} b.contentSelector
 * @param {Browser} [browser]
 */

async function scrapeArticle(
    { url, articleSelector, titleSelector, contentSelector },
    browser
) {
    let closeBrowser = false;
    try {
        if (!browser) {
            closeBrowser = true;
            browser = await puppeteer.launch({ headless: 'new' });
        }
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(2 * 60 * 1000);
        console.log(`Navigating to ${url}`);
        await page.goto(url);
        await page.waitForSelector(titleSelector);
        const title =
            (await page.$eval(
                titleSelector,
                (element) => element.textContent
            )) || 'No title';
        await page.waitForSelector(articleSelector);
        const article = await page.$(articleSelector);
        if (!article) {
            return { title, data: 'No content.' };
        }
        await updateImages(url, article);
        const paragraphs = await article.$$eval(
            contentSelector,
            (contentList) => contentList.map((content) => content.outerHTML)
        );
        const data = paragraphs.join('\n') || 'No conent';
        page.close();
        return {
            title,
            data,
        };
    } catch (e) {
        console.error('scrape failed', e);
    } finally {
        console.log(`Finished scraping ${url}`);
        if (closeBrowser) {
            await browser?.close();
        }
    }
}
/**
 * @param {string} rss
 */

async function getArticleLinks(rss) {
    const rssContent = await fetch(rss);
    const xmlContents = await rssContent.text();
    const parser = new XMLParser();
    let jObj = parser.parse(xmlContents);
    /**
     * @typedef RssItem
     * @prop {string} title
     * @prop {string} link
     * @prop {string} description
     * @prop {string} pubDate
     *  */
    /**
     * @type {RssItem[]}
     */
    const articleList = jObj.rss.channel.item;
    return articleList.map((i) => i.link);
}
export async function prepareEpub() {
    const articleLinkLists = await Promise.all(
        blogconfig.blogs.flatMap(async (b) => {
            const articleLinks = await getArticleLinks(b.url);
            console.log(`Found ${articleLinks.length} for blog ${b.name}!`);
            const filteredArticleLinks = articleLinks.slice(0, 5);
            console.log(`Only exporting last 5 article from each blog!`);
            return filteredArticleLinks.map((l) => {
                const blogArticle = Object.assign({}, b);
                blogArticle.url = l;
                return blogArticle;
            });
        })
    );
    const articleLinks = articleLinkLists.flat();
    const browser = await puppeteer.launch({ headless: 'new' });
    const scrapedArticles = [];
    for await (const a of articleLinks) {
        const articleContent = await scrapeArticle(a, browser);
        scrapedArticles.push(articleContent);
    }
    browser.close();
    /** @type {import('epub-gen').Chapter[]} */
    const chapters = [];
    scrapedArticles.forEach((article) => {
        if (article) {
            chapters.push(article);
        }
    });
    return chapters;
}
/**
 *
 * @param {string} title
 * @param {import("epub-gen").Chapter[]} chapters
 * @param {string} output
 * @returns
 */
export async function generateEpub(title, chapters, output) {
    const options = {
        title: title,
        content: chapters,
        verbose: false,
        output,
    };
    console.log(`Creating new epub file ${title} at ${output}`);
    const parentDirectory = path.dirname(output);
    if (!fs.existsSync(parentDirectory)) {
        fs.mkdirSync(parentDirectory, { recursive: true });
    }
    await new Epub(options);
}
