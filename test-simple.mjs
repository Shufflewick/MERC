import puppeteer from 'puppeteer';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testExplore() {
  console.log('Starting test...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-accelerated-2d-canvas',
      '--single-process',
      '--no-zygote'
    ]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Listen for selection-step API calls
    page.on('response', async res => {
      const url = res.url();
      if (url.includes('/selection-step')) {
        try {
          const text = await res.text();
          console.log('SELECTION-STEP RESPONSE:', text.substring(0, 300));
        } catch (e) {}
      }
    });

    console.log('Opening game...');
    await page.goto('http://localhost:8787');
    await delay(3000);

    // Click Create Game
    console.log('Creating game...');
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Create Game'));
      if (btn) btn.click();
    });
    await delay(2000);

    // Click Ready
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Ready'));
      if (btn) btn.click();
    });
    await delay(1000);

    // Click Make AI
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Make AI'));
      if (btn) btn.click();
    });
    await delay(5000);

    // Get current buttons
    let buttons = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => t && t.length < 50)
    );
    console.log('Game started. Buttons:', buttons.slice(0, 5).join(' | '));

    // Auto-play through Day 1 setup
    for (let i = 0; i < 50; i++) {
      buttons = await page.evaluate(() =>
        [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => t && t.length < 50)
      );

      // Check for equipment selection (our target)
      const hasEquipment = buttons.some(t => t?.includes('(Weapon)') || t?.includes('(Armor)') || t?.includes('(Accessory)'));

      if (hasEquipment) {
        console.log('EQUIPMENT SELECTION FOUND:', buttons.filter(t => t?.includes('(') && t?.includes(')')).join(' | '));

        // Click first equipment
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find(b =>
            b.textContent?.includes('(Weapon)') || b.textContent?.includes('(Armor)') || b.textContent?.includes('(Accessory)')
          );
          if (btn) {
            console.log('Clicking:', btn.textContent);
            btn.click();
          }
        });
        await delay(2500);

        // Check result
        const newButtons = await page.evaluate(() =>
          [...document.querySelectorAll('button')].map(b => b.textContent?.trim()).filter(t => t && t.length < 50)
        );
        const stillHasEquipment = newButtons.some(t => t?.includes('(Weapon)') || t?.includes('(Armor)') || t?.includes('(Accessory)'));

        console.log('After selection:', newButtons.slice(0, 6).join(' | '));
        console.log('Still has equipment options:', stillHasEquipment);

        if (stillHasEquipment) {
          console.log('SUCCESS: Repeating selection is working!');
        }
        break;
      }

      // Click any action button to progress
      const clicked = await page.evaluate(() => {
        const skipWords = ['Copy', 'Add', 'Remove', 'Cancel', 'Make AI', 'Update', 'Ready', 'Undo', 'Clear', 'State', 'Elements', 'Actions', 'History', 'Controls', 'Download', 'Expand', 'Collapse'];
        const btns = [...document.querySelectorAll('button')];
        for (const btn of btns) {
          const text = btn.textContent?.trim();
          if (!text || text.length > 50 || text.length < 2) continue;
          if (skipWords.some(w => text.includes(w))) continue;
          if (!btn.disabled) {
            btn.click();
            return text;
          }
        }
        return null;
      });

      if (clicked) {
        console.log('[' + i + '] Clicked:', clicked.substring(0, 40));
      }
      await delay(800);
    }

    console.log('Test complete');
  } finally {
    await browser.close();
  }
}

testExplore().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
