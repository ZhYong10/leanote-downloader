/**
 * Created by zhyong10 on 2018/6/1.
 */


const fs = require('fs');
const path = require('path')
const puppeteer = require('puppeteer');

const urls = {
    home: 'https://leanote.com/',
    imageBase: 'https://leanote.com/api/file/getImage?fileId=',
    notebookInfo: 'https://leanote.com/note/listNotes/?notebookId=',
    noteContent: 'https://leanote.com/note/getNoteContent?noteId='
};

(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        devtools: true,
        args: ['--start-fullscreen']
    });
    const pages = await browser.pages();
    const page = pages[0];

    await page.goto(urls.home)

    await page.waitForFunction('window.location.href.startsWith("https://leanote.com/note/")')
    await page.waitForFunction('notebooks');

    let notebooks = await page.evaluate('notebooks')
    console.log('download notebooks:', notebooks.map(n => n.Title).join(','))

    let noteDir = './files', imageDir = './files/_images'
    if (!fs.existsSync(noteDir)) {
        await fs.mkdir(noteDir, function (err) {
            if (err) throw err;
        })
    }

    if (!fs.existsSync(imageDir)) {
        await fs.mkdir(imageDir, function (err) {
            if (err) throw err;
        })
    }

    let downloadImage = async (imageId) => {
        const imageUrl = urls.imageBase + imageId;
        const imagePath = path.resolve(__dirname, './files/_images/', imageId + '.png')

        var viewSource = await page.goto(imageUrl);
        fs.writeFile(imagePath, await viewSource.buffer(), function (err) {
            if (err) {
                return console.log(err);
            }

            console.log("image saved", imageId);
        });
    }

    let downloadNotesInNotebook = async (notebook, parentNotebookTitle) => {
        let notebookId = notebook.NotebookId,
            notebookTitle = parentNotebookTitle || notebook.Title;

        await page.goto(urls.notebookInfo + notebookId)

        let notebookContent = await page.evaluate('document.body.innerText')
        let noteArray = JSON.parse(notebookContent);
        for (let i in noteArray) {
            let note = noteArray[i];
            let noteId = note.NoteId;

            await page.goto(urls.noteContent + noteId);
            let noteContent = await page.evaluate('document.body.innerText')

            let noteObject = JSON.parse(noteContent);

            let fileName = './files/' + notebookTitle + '__' + (note.Title).replace(/\//g, '-') + '.md'

            let imageIds = [];
            let contentWithUpdatedImage = noteObject.Content.split(urls.imageBase)
                .map((str, i) => {
                    if (i === 0) {
                        return str;
                    }
                    else {
                        // https://leanote.com/api/file/getImage?fileId={imageId} => _images/{imageId}.png
                        let imageId = str.substr(0, 24);
                        imageIds.push(imageId);
                        return '_images/' + imageId + '.png' + str.substr(24);
                    }
                })
                .join('');

            // save image
            for (let imageId of imageIds) {
                await downloadImage(imageId)
            }
            imageIds.length && console.log(imageIds.length + ' images:' + fileName)

            // save *.md
            await new Promise((resolve, reject) => {
                fs.writeFile(fileName, contentWithUpdatedImage, 'utf8', err => {
                    if (err) throw err;
                    resolve()
                });
            })

            console.log('note saved:', fileName)
        }
    }

    let downloadSubNotebooks = async (SubNotebook, parentNotebookTitle) => {
        let notebookTitle = (parentNotebookTitle ? parentNotebookTitle + '__' : '') + SubNotebook.Title;
        await downloadNotebook(SubNotebook, notebookTitle)
    }

    let downloadNotebook = async (notebook, parentNotebookTitle) => {
        await downloadNotesInNotebook(notebook, parentNotebookTitle)

        if (notebook.Subs && notebook.Subs.length) {
            for (let SubIndex in notebook.Subs) {
                await downloadSubNotebooks(notebook.Subs[SubIndex], parentNotebookTitle)
            }
        }
    }

    for (let notebook of notebooks) {
        await downloadNotebook(notebook, notebook.Title);// .NotebookId, notebook.Title)
    }

    console.log('all finished.')

    browser.close()
})
()
