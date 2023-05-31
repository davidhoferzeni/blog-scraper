import puppeteer, { Browser, ElementHandle } from 'puppeteer';
import Epub from 'epub-gen';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import blogconfig from './blogconfig.json' assert { type: 'json' };
import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { randomUUID } from 'crypto';

/**
 * @param {string} uri
 * @param {string} out
 * @returns {Promise<string>}
 */
async function downloadFile(uri, out) {
    const parentDirectory = path.dirname(out);
    if (!fs.existsSync(parentDirectory)) {
        fs.mkdirSync(parentDirectory, { recursive: true });
    }
    return new Promise((requestComplete) => {
        https.get(uri, async function (response) {
        const fileType = response.headers['content-type']
            ?.toString()
            .replace('image/', '');
            const fileName = `${out}.${fileType}`;
            const file = fs.createWriteStream(fileName);
        response.pipe(file);
        file.on('finish', () => {
            file.close();
            console.log('Download Completed');
                requestComplete(fileName);
        });
    });
    });
}
/**
 * @param {string | URL} url
 * @param {string} href
 * @param {string} out
 */
async function downloadImageFromPage(url, href, out) {
    const webpageUrl = new URL(href, url);
    const imageName = randomUUID();
    const outPath = path.join(out, imageName);
    await downloadFile(webpageUrl.toString(), outPath);
    return outPath;
}

/**
 * @param {string} url
 * @param {ElementHandle} article
 */
async function extractImages(url, article) {
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
        await extractImages(url, article);
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

async function prepareEpub() {
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
async function generateEpub(title, chapters, output) {
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

/**
 * @param {string} fileName
 * @param {string} outputPath
 */
async function sendEpub(fileName, outputPath) {
    console.log('Sending file via mail');
    const emailCredentials = {
        user: process.env.EMAIL_USER || '',
        pass: process.env.EMAIL_PASSWORD || '',
    };
    const fileAttachement = {
        filename: fileName,
        path: outputPath,
        contentType: 'application/epub',
    };
    await sendFile(
        process.env.EMAIL_PROVIDER || '',
        emailCredentials,
        process.env.EMAIL_RECIPIENTS || '',
        [fileAttachement]
    );
}

/**
 *
 * @param {string} service
 * @param {import("nodemailer/lib/smtp-connection").Credentials} credentials
 * @param {string} recipients
 * @param {import("nodemailer/lib/mailer").Attachment[]} attachments
 */
async function sendFile(service, credentials, recipients, attachments) {
    const transporter = nodemailer.createTransport({
        service: service,
        auth: credentials,
    });
    /** @type {import("nodemailer/lib/smtp-transport").MailOptions} */
    const mailOptions = {
        from: credentials.user,
        to: recipients,
        attachments,
        html: '<div dir="auto"></div>',
    };
    transporter.sendMail(mailOptions);
}

async function run() {
    dotenv.config();
    const dateTimeStamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .replace(/\.\d\d\dZ/, '');
    const articleTitle = `${dateTimeStamp} Blog Feed`;
    const fileName = `${dateTimeStamp}_BlogFeed.epub`;
    const outputPath = `./out/${fileName}`;
    const chapters = await prepareEpub();
    await generateEpub(articleTitle, chapters, outputPath);
    await sendEpub(fileName, outputPath);
}

run();
