const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');
const util = require('util');
const puppeteer = require('puppeteer');
const { format } = require('date-fns');
const easyPdfMerge = require('easy-pdf-merge');

const mkdir = util.promisify(fs.mkdir);

async function start({ target }) {
  const tmpDir = path.resolve(__dirname, 'tmp');
  if (!fs.existsSync(tmpDir)) {
    await mkdir(tmpDir);
  }

  const browser = await puppeteer.launch();

  const page = await browser.newPage();
  await page.goto('http://localhost:8888', { waitUntil: 'domcontentloaded' });

  const files = await visit(page);

  await new Promise((resolve, reject) => {
    easyPdfMerge(files, target, error => {
      if (error) {
        return reject(error);
      }
      resolve();
    });
  });

  browser.close();
  rimraf.sync(tmpDir);
}

async function visit(page) {
  const url = page.url();
  console.log('>>> shooting', await page.title(), url);

  const file = await shoot(page);

  // navigation has two links. the first one is for "previous page" the second for "next page"
  // (note that we cannot use the keyboard "ArrowRight" as the integrated terminal on some slides is taking the keyboard focus)
  const navArrowsComponent = await page.$('nav-arrows');

  // the slide could display the terminal which takes the focus
  // therefore pressing keyLeft or keyRight does not result in page navigation anymore
  // however, focusing another element than the terminal solves this
  navArrowsComponent.focus();

  // navigate to next slide
  await page.keyboard.press('ArrowRight');

  await page.waitForSelector('#top');

  if (url === page.url()) {
    // last link links to the same page
    // so when the url didn't change after click we're finished ٩( ᐛ )و
    return [];
  }

  const moreFiles = await visit(page);
  return [file, ...moreFiles];
}

async function shoot(page) {
  const timestamp = format(new Date(), 'YYYY-MM-dd-HH.mm.ss');
  const filename = `${getSlideNumberFromPage(page)}_${timestamp}.pdf`;
  const filepath = path.resolve(__dirname, 'tmp', filename);

  await page.reload({
    waitUntil: 'domcontentloaded',
  });

  await page.pdf({
    path: filepath,
    printBackground: true,
    width: '1680px',
    height: '1050px',
  });

  return filepath;
}

function getSlideNumberFromPage(page) {
  const slideNumberMatch = page.url().match(/\d+$/);
  return slideNumberMatch ? Number(slideNumberMatch[0]) : 0;
}

const targetPdf = path.resolve(__dirname, '../slides.pdf');

start({ target: targetPdf }).then(
  () => {
    console.log('\nsuccessfully generated %s\n', targetPdf);
    process.exit(0);
  },
  error => {
    console.error('\n🙀 failed to generate PDF\n');
    console.error(error.message || error);
    process.exit(1);
  }
);
