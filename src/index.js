import dotenv from 'dotenv';
import { sendFile } from './logic/emailLogic.js';
import { prepareEpub } from './logic/epubLogic.js';
import { generateEpub } from './logic/epubLogic.js';

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
