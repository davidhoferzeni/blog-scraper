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
