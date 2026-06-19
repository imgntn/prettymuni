const { test, expect } = require('@playwright/test');
const { buildVehiclePositionsFeed } = require('./helpers/gtfsFixtures');

const tinyGeoJSON = {
  type: 'FeatureCollection',
  features: [],
};

const linesFixture = [
  { PublicCode: '38', Name: 'Geary' },
  { PublicCode: 'N', Name: 'Judah' },
  { PublicCode: '14', Name: 'Mission' },
  { PublicCode: 'J', Name: 'Church' },
  { PublicCode: '7', Name: 'Haight' },
];

const patternsFixture = {
  Contents: {
    dataObjects: {
      ServiceJourneyPattern: [
        {
          pointsInSequence: {
            StopPointInJourneyPattern: [
              { ScheduledStopPointRef: 'stop_a' },
              { ScheduledStopPointRef: 'stop_b' },
              { ScheduledStopPointRef: 'stop_c' },
            ],
          },
        },
      ],
    },
  },
};

const stopsFixture = {
  Contents: {
    dataObjects: {
      ScheduledStopPoint: [
        {
          id: 'stop_a',
          Name: 'Stop A',
          Location: { Latitude: '37.7749', Longitude: '-122.4194' },
        },
        {
          id: 'stop_b',
          Name: 'Stop B',
          Location: { Latitude: '37.7762', Longitude: '-122.4178' },
        },
        {
          id: 'stop_c',
          Name: 'Stop C',
          Location: { Latitude: '37.7776', Longitude: '-122.4159' },
        },
      ],
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/assets/sfmaps/*.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tinyGeoJSON),
    });
  });

  await page.route('**/api/511/lines**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(linesFixture),
    });
  });

  await page.route('**/api/511/patterns**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(patternsFixture),
    });
  });

  await page.route('**/api/511/stops**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(stopsFixture),
    });
  });

  await page.route('**/api/511/vehiclepositions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/x-google-protobuf',
      body: Buffer.from(buildVehiclePositionsFeed('14')),
    });
  });
});

test('loads route selector and route tiles', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.show-route-selector-button-holder')).toBeVisible();
  await page.locator('.show-route-selector-button-holder').click();

  await expect(page.locator('.route-selector')).toBeVisible();
  await expect(page.locator('.route-selector-tile[value="14"]')).toBeVisible();
  await expect(page.locator('.route-selector-tile[value="38"]')).toBeVisible();
});

test('orders routes alphabetically then numerically ascending', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.show-route-selector-button-holder')).toBeVisible();
  await page.locator('.show-route-selector-button-holder').click();

  const routeOrder = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.route-selector-tile')).map((el) =>
      el.getAttribute('value')
    );
  });

  expect(routeOrder).toEqual(['J', 'N', '7', '14', '38']);

  const searchOrder = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('#route-search-options option')).map(
      (el) => el.value
    );
  });

  expect(searchOrder[0].startsWith('J ')).toBeTruthy();
  expect(searchOrder[1].startsWith('N ')).toBeTruthy();
  expect(searchOrder[2].startsWith('7 ')).toBeTruthy();
});

test('activates route and draws path and vehicle marker', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.show-route-selector-button-holder')).toBeVisible();
  await page.locator('.show-route-selector-button-holder').click();

  const routeTile = page.locator('.route-selector-tile[value="14"]');
  await expect(routeTile).toBeVisible();
  await routeTile.click();

  await expect(routeTile).toHaveClass(/active/);
  await expect.poll(async () => {
    return page.evaluate(() => (window.liveMapper.routePathGeometryByRoute['14'] || []).length);
  }).toBeGreaterThan(0);

  await expect.poll(async () => {
    return page.evaluate(() => (window.liveMapper.vehicleRenderDataByRoute['14'] || []).length);
  }).toBe(1);
});

test('toggles show all routes from main menu', async ({ page }) => {
  await page.goto('/');

  const toggleAllButton = page.locator('.toggle-all-routes-button-holder');
  await expect(toggleAllButton).toBeVisible();
  await toggleAllButton.click();

  await expect(page.locator('.route-selector-tile[value="14"]')).toHaveClass(/active/);
  await expect(page.locator('.route-selector-tile[value="38"]')).toHaveClass(/active/);
  await expect(page.locator('.toggle-all-routes-button')).toHaveText('Hide All Routes');

  await toggleAllButton.click();
  await expect(page.locator('.toggle-all-routes-button')).toHaveText('Show All Routes');
});

test('activates route from top-menu autocomplete search', async ({ page }) => {
  await page.goto('/');

  const searchInput = page.locator('.route-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('14 Mission');
  await searchInput.press('Enter');

  await expect(page.locator('.route-selector-tile[value="14"]')).toHaveClass(/active/);
  await expect.poll(async () => {
    return page.evaluate(() => (window.liveMapper.vehicleRenderDataByRoute['14'] || []).length);
  }).toBe(1);
});

test('supports mouse wheel zoom on map', async ({ page }) => {
  await page.goto('/');

  const searchInput = page.locator('.route-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('14 Mission');
  await searchInput.press('Enter');
  await expect.poll(async () => {
    return page.evaluate(() => (window.liveMapper.routePathGeometryByRoute['14'] || []).length);
  }).toBeGreaterThan(0);

  const beforeTransform = await page.locator('#zoom-stage').getAttribute('transform');
  await page.mouse.move(420, 360);
  await page.mouse.wheel(0, -900);

  await expect.poll(async () => {
    return page.locator('#zoom-stage').getAttribute('transform');
  }).not.toBe(beforeTransform);
});
