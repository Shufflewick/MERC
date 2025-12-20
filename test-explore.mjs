import puppeteer from 'puppeteer';

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function clickButtonWithText(page, text) {
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const btnText = await page.evaluate(el => el.textContent, btn);
    if (btnText && btnText.includes(text)) {
      await btn.click();
      return true;
    }
  }
  return false;
}

async function getAllButtonTexts(page) {
  const buttons = await page.$$('button');
  const texts = [];
  for (const btn of buttons) {
    const text = await page.evaluate(el => el.textContent?.trim(), btn);
    if (text) texts.push(text);
  }
  return texts;
}

// Debug panel buttons to ignore
const DEBUG_BUTTONS = ['Clear', 'State', 'Elements', 'Actions', 'History', 'Controls',
                       'Copy', 'Download', 'Expand', 'Collapse', '100%', '✕', '⎘'];

function isDebugButton(text) {
  return DEBUG_BUTTONS.some(db => text === db || text.includes('⎘'));
}

async function testExplore() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--window-size=1400,900', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Track selection-step calls
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/selection-step')) {
      console.log('>>> SELECTION-STEP REQUEST');
    }
  });

  page.on('response', async res => {
    const url = res.url();
    if (url.includes('/selection-step')) {
      try {
        const text = await res.text();
        const parsed = JSON.parse(text);
        console.log('<<< SELECTION-STEP RESPONSE:', JSON.stringify(parsed).substring(0, 200));
      } catch (e) {}
    }
    if (url.includes('/action') && !url.includes('.js')) {
      try {
        const text = await res.text();
        const parsed = JSON.parse(text);
        if (parsed.success !== undefined) {
          console.log('<<< ACTION:', url.split('/').pop(), 'success:', parsed.success);
        }
      } catch (e) {}
    }
  });

  // Listen for console
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('selection') || text.includes('repeat') || text.includes('equipment') ||
        text.includes('Error') || text.includes('nextChoices')) {
      console.log('BROWSER:', msg.type(), text);
    }
  });

  console.log('Opening game...');
  await page.goto('http://localhost:8787');
  await delay(2000);

  // Create a new game
  console.log('Creating game...');
  await clickButtonWithText(page, 'Create Game');
  await delay(1500);

  // Mark player 0 as ready and make player 1 AI
  console.log('Setting up game...');
  await clickButtonWithText(page, 'Ready?');
  await delay(800);
  await clickButtonWithText(page, 'Make AI');
  await delay(5000);

  let buttonTexts = await getAllButtonTexts(page);
  const gameButtons = buttonTexts.filter(t => !isDebugButton(t) && t.length < 50);
  console.log('Game buttons:', gameButtons.join(' | '));

  let exploringActive = false;

  // Play through the game
  for (let i = 0; i < 300; i++) {
    const allText = await page.evaluate(() => document.body.innerText);
    buttonTexts = await getAllButtonTexts(page);
    const actionButtons = buttonTexts.filter(t => !isDebugButton(t) && t.length < 50);

    // Check if we have equipment selection options (Weapon/Armor/Accessory with parentheses)
    const hasEquipmentOptions = actionButtons.some(t =>
      t.includes('(Weapon)') || t.includes('(Armor)') || t.includes('(Accessory)')
    );

    if (i % 20 === 0) {
      console.log(`[${i}] Buttons:`, actionButtons.slice(0, 6).join(' | '));
    }

    // PRIORITY 1: Check for equipment selection (after Explore)
    if (hasEquipmentOptions || (exploringActive && allText.includes('What should'))) {
      console.log('>>> EQUIPMENT SELECTION DETECTED');
      console.log('    All buttons:', actionButtons.join(' | '));

      // Find first equipment option and click it
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text && (text.includes('(Weapon)') || text.includes('(Armor)') || text.includes('(Accessory)'))) {
          console.log('>>> CLICKING EQUIPMENT:', text.trim());
          await btn.click();
          await delay(2500);

          // Check result
          const newButtonTexts = await getAllButtonTexts(page);
          const newActionButtons = newButtonTexts.filter(t => !isDebugButton(t) && t.length < 50);
          const stillHasEquipment = newButtonTexts.some(t =>
            t.includes('(Weapon)') || t.includes('(Armor)') || t.includes('(Accessory)')
          );
          const hasDone = newButtonTexts.some(t => t === 'Done');

          console.log('>>> After selection:');
          console.log('    Buttons:', newActionButtons.join(' | '));
          console.log('    Still has equipment:', stillHasEquipment);
          console.log('    Has Done button:', hasDone);

          if (stillHasEquipment) {
            console.log('>>> SUCCESS: REPEATING SELECTION WORKS!');
          }
          break;
        }
      }
      continue;
    }

    // PRIORITY 2: Click Explore if available
    if (actionButtons.some(t => t.includes('Explore') && !t.includes('explored'))) {
      console.log('>>> CLICKING EXPLORE');
      exploringActive = true;
      await clickButtonWithText(page, 'Explore');
      await delay(2000);
      continue;
    }

    // Reset exploring flag if we moved to other actions
    if (actionButtons.some(t => t.includes('Move') || t.includes('Train') || t.includes('End Turn'))) {
      exploringActive = false;
    }

    // PRIORITY 3: Click Done only when not in equipment selection
    if (actionButtons.some(t => t === 'Done') && !hasEquipmentOptions) {
      console.log('>>> Clicking Done (no equipment available)');
      await clickButtonWithText(page, 'Done');
      await delay(500);
      continue;
    }

    // PRIORITY 4: Click Confirm
    if (actionButtons.some(t => t === 'Confirm')) {
      console.log('>>> Clicking Confirm');
      await clickButtonWithText(page, 'Confirm');
      await delay(500);
      continue;
    }

    // Click action buttons for Day 1 setup
    const priorityActions = [
      'Hire your starting MERCs',
      'Place your landing zone',
      'Choose starting equipment',
      'End Turn',
    ];

    let clicked = false;
    for (const action of priorityActions) {
      if (actionButtons.some(t => t.includes(action))) {
        console.log('>>> Clicking action:', action);
        await clickButtonWithText(page, action);
        clicked = true;
        await delay(800);
        break;
      }
    }
    if (clicked) continue;

    // Click first available selection button
    const buttons = await page.$$('button');
    for (const btn of buttons) {
      const text = await page.evaluate(el => el.textContent?.trim(), btn);
      const isEnabled = await page.evaluate(el => !el.disabled, btn);

      if (!isEnabled || !text) continue;
      if (isDebugButton(text)) continue;
      if (text.includes('Copy') || text.includes('Add') ||
          text.includes('Remove') || text.includes('Cancel') ||
          text.includes('Make AI') || text.includes('Update') ||
          text.includes('Ready') || text.includes('Undo') ||
          text.includes('Split') || text.includes('Merge')) {
        continue;
      }

      // Click sector selections (prefer edge for landing)
      if (text.includes('(Edge)')) {
        console.log('>>> Clicking Edge Sector:', text.substring(0, 40));
        await btn.click();
        clicked = true;
        await delay(600);
        break;
      }

      // Click equipment type selections
      if (text === 'Weapon' || text === 'Armor' || text === 'Accessory') {
        console.log('>>> Clicking Equipment type:', text);
        await btn.click();
        clicked = true;
        await delay(600);
        break;
      }

      // Click MERC names
      if (text.split(' ').length <= 2 && text.length < 25 && !text.includes('squad')) {
        console.log('>>> Clicking MERC/Selection:', text);
        await btn.click();
        clicked = true;
        await delay(600);
        break;
      }
    }

    await delay(400);
  }

  console.log('Test complete. Waiting...');
  await delay(20000);
  await browser.close();
}

testExplore().catch(console.error);
