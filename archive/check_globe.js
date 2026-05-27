(async () => {
  const puppeteer = (await import('puppeteer')).default || await import('puppeteer');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.toString()));
  page.on('response', response => {
    if (!response.ok()) console.log('FAILED RESPONSE:', response.status(), response.url());
  });
  
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
  
  // Wait a moment for start screen
  await new Promise(r => setTimeout(r, 1000));
  
  // Click English language
  const el = await page.$('ul.lang-list li');
  if (el) {
    console.log('Clicking language...');
    await el.click();
  } else {
    console.log('Language list not found');
  }
  
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Waiting for flight to complete (approx 20 seconds)...');
  await new Promise(r => setTimeout(r, 20000));
  
  console.log('Clicking language again for second flight...');
  const el2 = await page.$('ul.lang-list li');
  if (el2) {
    await el2.click();
  }
  
  await new Promise(r => setTimeout(r, 3000));
  
  // Get globe container dimension on second run
  const dims2 = await page.evaluate(() => {
    const cont = document.getElementById('globe-container');
    const canvas = cont.querySelector('canvas');
    return {
      contW: cont.clientWidth,
      contH: cont.clientHeight,
      canvW: canvas ? canvas.width : -1,
      canvH: canvas ? canvas.height : -1,
      display: window.getComputedStyle(cont).display,
      opacity: window.getComputedStyle(cont).opacity
    };
  });
  
  console.log('Dimensions 2:', dims2);
  
  await browser.close();
})();
