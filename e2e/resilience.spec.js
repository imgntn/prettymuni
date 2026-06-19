const { test, expect } = require('@playwright/test');
const { buildVehiclePositionsFeed } = require('./helpers/gtfsFixtures');

const tinyGeoJSON = {
  type: 'FeatureCollection',
  features: [],
};

const linesFixture = [
  { PublicCode: '14', Name: 'Mission' },
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
      ],
    },
  },
};

async function setupStaticMocks(page) {
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
}

async function activateRouteAndSpeedRefresh(page, refreshRateSeconds) {
  await page.goto('/');
  await expect(page.locator('.show-route-selector-button-holder')).toBeVisible();
  await page.locator('.show-route-selector-button-holder').click();
  await page.locator('.route-selector-tile[value="14"]').click();

  await page.evaluate((refreshRate) => {
    window.liveMapper.refreshRate = refreshRate;
    window.liveMapper.consecutiveRefreshErrors = 0;
    window.liveMapper.refreshActiveRoutes();
  }, refreshRateSeconds);
}

test('backs off refresh interval after repeated vehicle feed failures', async ({ page }) => {
  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push(msg.text());
  });

  await setupStaticMocks(page);

  await page.route('**/api/511/vehiclepositions**', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'upstream unavailable' }),
    });
  });

  await activateRouteAndSpeedRefresh(page, 0.1);

  await expect.poll(() => {
    return consoleMessages.filter((message) => message.includes('Refresh failed, backing off to')).length;
  }, { timeout: 8000 }).toBeGreaterThanOrEqual(2);

  const has200msBackoff = consoleMessages.some((message) => message.includes('backing off to 200ms'));
  const has400msBackoff = consoleMessages.some((message) => message.includes('backing off to 400ms'));

  expect(has200msBackoff).toBeTruthy();
  expect(has400msBackoff).toBeTruthy();
});

test('recovers and resumes rendering when vehicle feed succeeds after transient failures', async ({ page }) => {
  let vehicleRequestCount = 0;

  await setupStaticMocks(page);

  await page.route('**/api/511/vehiclepositions**', async (route) => {
    vehicleRequestCount += 1;

    if (vehicleRequestCount <= 2) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'temporary outage' }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/x-google-protobuf',
      body: Buffer.from(buildVehiclePositionsFeed('14')),
    });
  });

  await activateRouteAndSpeedRefresh(page, 0.1);

  await expect.poll(async () => {
    return page.evaluate(() => (window.liveMapper.vehicleRenderDataByRoute['14'] || []).length);
  }, { timeout: 10000 }).toBe(1);

  await expect.poll(async () => {
    return page.evaluate(() => window.liveMapper.consecutiveRefreshErrors);
  }, { timeout: 8000 }).toBe(0);
});
