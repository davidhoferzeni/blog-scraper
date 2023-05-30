import puppeteer, { Browser } from 'puppeteer';
import Epub from 'epub-gen';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import blogconfig from './blogconfig.json' assert { type: 'json' };

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
    try {
        if (!browser) {
            browser = await puppeteer.launch({ headless: 'new' });
        }
        const page = await browser.newPage();
        page.setDefaultNavigationTimeout(2 * 60 * 1000);
        await page.goto(url);
        await page.waitForSelector(titleSelector);
        const title =
            (await page.$eval(
                titleSelector,
                (element) => element.textContent
            )) || 'No title';
        await page.waitForSelector(articleSelector);
        const article = await page.$(articleSelector);
        const paragraphs = await article?.$$eval(contentSelector, (elements) =>
            elements.map((el) => el.outerHTML)
        );
        const data = paragraphs?.join('\n') || 'No conent';
        return {
            title,
            data,
        };
    } catch (e) {
        console.error('scrape failed', e);
    } finally {
        await browser?.close();
    }
}

async function prepareEpub() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const scrapedArticles = await Promise.all(
        blogconfig.blogs.map((b) => scrapeArticle(b, browser))
    );
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
 * @param {string} [output]
 * @returns
 */
async function generateEpub(title, chapters, output) {
    const options = {
        title: title,
        content: chapters,
        verbose: false,
        output,
    };
    await new Epub(options);
}

/**
 * @param {string} fileName
 * @param {string} outputPath
 */
async function sendEpub(fileName, outputPath) {
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
    //await sendEpub(fileName, outputPath);
}

run();
