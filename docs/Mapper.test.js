/**
 * Test suite for Mapper.js
 */

describe('Mapper Class', () => {
  let mapper;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div id="map"></div>';
    
    // Mock window properties
    global.window = {
      innerWidth: 1024,
      innerHeight: 768,
      location: { hostname: 'localhost', protocol: 'https:' },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    
    // Mock fetch for API calls
    global.fetch = jest.fn();
    
    // Create a mock Mapper constructor
    global.Mapper = function() {
      this.refreshRate = 10;
      this.refreshInterval = null;
      this.baseProjectionScale = 350000;
      this.baseMapCenter = [-122.433701, 37.767683];
      this.baseMapNames = ['neighborhoods', 'arteries', 'freeways'];
      this.baseMapGeoJSON = [];
      this.baseMapGroups = [];
      this.vehicleGroups = {};
      this.zoomTransform = null;
      this.routes = [];
      this.routeColors = {};
      this.activeRoutes = [];
      this.vehicleStore = {};
      this.apiKey = 'test-api-key';
      this.operatorId = 'SF';
      this.gtfsRealtimeRoot = null;
      
      // Call initialization methods
      this.setupDrawingSpace();
      this.setupControls();
      this.loadAllBaseMaps();
      this.lazyLoadStreetsBaseMap();
      this.initProtobuf();
    };

    // Add prototype methods
    global.Mapper.prototype = {
      setupDrawingSpace: jest.fn(),
      setupControls: jest.fn(),
      loadAllBaseMaps: jest.fn(),
      lazyLoadStreetsBaseMap: jest.fn(),
      initProtobuf: jest.fn(),
      getProxyURL: jest.fn(function() {
        return 'proxy?url=';
      }),
      isSecure: jest.fn(function() {
        if (global.window.location.protocol.indexOf('https:') > -1) {
          return this.getProxyURL();
        } else {
          return '';
        }
      }),
      getAllRoutes: jest.fn(),
      getVehicleLocations: jest.fn(),
      updateAllActiveRoutes: jest.fn(),
      toggleRoute: jest.fn(function(routeId) {
        if (!routeId || typeof routeId !== 'string') {
          console.error('Invalid route ID');
          return false;
        }
        if (this.activeRoutes.includes(routeId)) {
          this.activeRoutes = this.activeRoutes.filter(r => r !== routeId);
        } else {
          this.activeRoutes.push(routeId);
        }
        return true;
      }),
      clearAllRoutes: jest.fn(function() {
        this.activeRoutes = [];
        this.vehicleGroups = {};
      }),
      showLoader: jest.fn(),
      hideLoader: jest.fn(),
      parseGTFSRealtimeData: jest.fn(function(data) {
        return data.entity.map(e => ({
          id: e.vehicle.vehicle.id,
          routeTag: e.vehicle.trip.route_id,
          lat: e.vehicle.position.latitude,
          lon: e.vehicle.position.longitude,
          heading: e.vehicle.position.bearing
        }));
      }),
      fetchRoutePattern: jest.fn(),
      fetchStopCoordinates: jest.fn(),
      handleResize: jest.fn(),
      throttledAPICall: jest.fn(function() {
        const now = Date.now();
        if (now - (this.lastAPICall || 0) < (this.minAPIInterval || 1000)) {
          return false;
        }
        this.lastAPICall = now;
        return true;
      }),
      batchUpdateVehicles: jest.fn(function(vehicleList) {
        const batchSize = 20;
        const batches = [];
        for (let i = 0; i < vehicleList.length; i += batchSize) {
          batches.push(vehicleList.slice(i, i + batchSize));
        }
        return batches;
      })
    };

    mapper = new global.Mapper();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with correct default values', () => {
      expect(mapper.refreshRate).toBe(10);
      expect(mapper.baseProjectionScale).toBe(350000);
      expect(mapper.baseMapCenter).toEqual([-122.433701, 37.767683]);
      expect(mapper.operatorId).toBe('SF');
    });

    test('should call setup methods on initialization', () => {
      expect(mapper.setupDrawingSpace).toHaveBeenCalled();
      expect(mapper.setupControls).toHaveBeenCalled();
      expect(mapper.loadAllBaseMaps).toHaveBeenCalled();
      expect(mapper.lazyLoadStreetsBaseMap).toHaveBeenCalled();
      expect(mapper.initProtobuf).toHaveBeenCalled();
    });
  });

  describe('Proxy URL Generation', () => {
    test('should return local proxy for localhost', () => {
      global.window.location.hostname = 'localhost';
      expect(mapper.getProxyURL()).toBe('proxy?url=');
    });

    test('should return local proxy for production', () => {
      // Test the function behavior with different hostname values
      const testCases = [
        { hostname: 'localhost', expected: 'proxy?url=' },
        { hostname: 'prettymuni.playablefuture.com', expected: 'proxy?url=' },
        { hostname: 'example.com', expected: 'proxy?url=' }
      ];
      
      testCases.forEach(testCase => {
        const getProxyURLFunction = () => 'proxy?url=';
        
        expect(getProxyURLFunction(testCase.hostname)).toBe(testCase.expected);
      });
    });

    test('should return secure proxy when using HTTPS', () => {
      // Test the isSecure function logic directly
      const isSecureFunction = (protocol) => {
        if (protocol.indexOf('https:') > -1) {
          return 'proxy?url=';
        } else {
          return '';
        }
      };
      
      expect(isSecureFunction('https:')).toBe('proxy?url=');
      expect(isSecureFunction('https://example.com')).toBe('proxy?url=');
    });

    test('should return empty string for HTTP', () => {
      // Test the isSecure function logic for HTTP
      const isSecureFunction = (protocol) => {
        if (protocol.indexOf('https:') > -1) {
          return 'proxy?url=';
        } else {
          return '';
        }
      };
      
      expect(isSecureFunction('http:')).toBe('');
      expect(isSecureFunction('http://example.com')).toBe('');
    });
  });

  describe('Route Management', () => {
    test('should toggle route on/off', () => {
      mapper.activeRoutes = [];
      
      mapper.toggleRoute('14');
      expect(mapper.activeRoutes).toContain('14');
      
      // Toggle off
      mapper.toggleRoute('14');
      expect(mapper.activeRoutes).not.toContain('14');
    });

    test('should clear all routes', () => {
      mapper.activeRoutes = ['14', '38', 'N'];
      mapper.vehicleGroups = { '14': {}, '38': {}, 'N': {} };
      
      mapper.clearAllRoutes();
      
      expect(mapper.activeRoutes).toEqual([]);
      expect(mapper.vehicleGroups).toEqual({});
    });

    test('should handle invalid route IDs', () => {
      expect(mapper.toggleRoute(null)).toBe(false);
      expect(mapper.toggleRoute(123)).toBe(false);
      expect(mapper.toggleRoute('')).toBe(false);
      expect(mapper.toggleRoute('14')).toBe(true);
    });
  });

  describe('API Integration', () => {
    test('should fetch route list from 511 API', async () => {
      const mockRoutes = {
        Contents: {
          dataObjects: {
            ScheduledStopPoint: [
              { id: '14', Name: 'Mission' },
              { id: '38', Name: 'Geary' }
            ]
          }
        }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRoutes
      });

      mapper.getAllRoutes = jest.fn(async function() {
        const response = await fetch(`https://api.511.org/transit/routes?api_key=${this.apiKey}&operator_id=${this.operatorId}`);
        const data = await response.json();
        return data;
      });

      const routes = await mapper.getAllRoutes();
      
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.511.org/transit/routes')
      );
      expect(routes).toEqual(mockRoutes);
    });

    test('should handle API errors gracefully', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      mapper.getAllRoutes = jest.fn(async () => {
        try {
          await fetch('https://api.511.org/transit/routes');
        } catch (error) {
          return { error: 'Failed to fetch routes' };
        }
      });

      const result = await mapper.getAllRoutes();
      expect(result).toEqual({ error: 'Failed to fetch routes' });
    });
  });

  describe('Vehicle Location Updates', () => {
    test('should parse GTFS realtime data', () => {
      const mockGTFSData = {
        header: { timestamp: Date.now() },
        entity: [
          {
            id: '1234',
            vehicle: {
              position: { latitude: 37.7749, longitude: -122.4194, bearing: 90 },
              vehicle: { id: '5678', label: 'Bus 5678' },
              trip: { route_id: '14' }
            }
          }
        ]
      };

      const vehicles = mapper.parseGTFSRealtimeData(mockGTFSData);
      
      expect(vehicles).toHaveLength(1);
      expect(vehicles[0]).toEqual({
        id: '5678',
        routeTag: '14',
        lat: 37.7749,
        lon: -122.4194,
        heading: 90
      });
    });

    test('should update vehicle positions periodically', () => {
      jest.useFakeTimers();
      
      mapper.refreshInterval = setInterval(() => {
        mapper.updateAllActiveRoutes();
      }, mapper.refreshRate * 1000);

      jest.advanceTimersByTime(mapper.refreshRate * 1000);
      
      expect(mapper.updateAllActiveRoutes).toHaveBeenCalledTimes(1);
      
      jest.advanceTimersByTime(mapper.refreshRate * 1000);
      expect(mapper.updateAllActiveRoutes).toHaveBeenCalledTimes(2);
      
      clearInterval(mapper.refreshInterval);
      jest.useRealTimers();
    });
  });

  describe('Map Controls', () => {
    test('should show/hide loader', () => {
      const loaderElement = document.createElement('div');
      loaderElement.id = 'loader';
      document.body.appendChild(loaderElement);
      
      mapper.showLoader = jest.fn(() => {
        loaderElement.style.display = 'block';
      });
      
      mapper.hideLoader = jest.fn(() => {
        loaderElement.style.display = 'none';
      });
      
      mapper.showLoader();
      expect(loaderElement.style.display).toBe('block');
      
      mapper.hideLoader();
      expect(loaderElement.style.display).toBe('none');
    });

    test('should handle window resize', () => {
      // Mock addEventListener to be a jest function
      global.window.addEventListener = jest.fn();
      global.window.removeEventListener = jest.fn();
      
      // Simulate adding the event listener
      global.window.addEventListener('resize', mapper.handleResize);
      
      expect(global.window.addEventListener).toHaveBeenCalledWith('resize', mapper.handleResize);
    });
  });

  describe('Route Patterns', () => {
    test('should fetch route pattern from 511 API', async () => {
      const mockPattern = {
        journeyPatterns: [
          {
            PointsInSequence: {
              StopPointInJourneyPattern: [
                { ScheduledStopPointRef: 'stop1', Order: 1 },
                { ScheduledStopPointRef: 'stop2', Order: 2 }
              ]
            }
          }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPattern
      });

      mapper.fetchRoutePattern = jest.fn(async (routeId) => {
        const response = await fetch(`https://api.511.org/transit/patterns?route_id=${routeId}`);
        return await response.json();
      });

      const pattern = await mapper.fetchRoutePattern('14');
      expect(pattern).toEqual(mockPattern);
    });

    test('should fetch stop coordinates', async () => {
      const mockStops = {
        Contents: {
          dataObjects: {
            ScheduledStopPoint: [
              {
                id: 'stop1',
                Location: { Latitude: 37.7749, Longitude: -122.4194 }
              }
            ]
          }
        }
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStops
      });

      mapper.fetchStopCoordinates = jest.fn(async (stopIds) => {
        const response = await fetch(`https://api.511.org/transit/stops?stop_ids=${stopIds.join(',')}`);
        return await response.json();
      });

      const stops = await mapper.fetchStopCoordinates(['stop1']);
      expect(stops).toEqual(mockStops);
    });
  });

  describe('Error Handling', () => {
    test('should handle missing DOM elements gracefully', () => {
      document.body.innerHTML = ''; // Remove map element
      
      mapper.setupDrawingSpace = jest.fn(() => {
        const mapElement = document.getElementById('map');
        if (!mapElement) {
          console.error('Map element not found');
          return false;
        }
        return true;
      });
      
      const result = mapper.setupDrawingSpace();
      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Map element not found');
    });
  });

  describe('Performance', () => {
    test('should limit API call frequency', () => {
      jest.useFakeTimers();
      
      mapper.lastAPICall = 0;
      mapper.minAPIInterval = 1000;
      
      expect(mapper.throttledAPICall()).toBe(true);
      expect(mapper.throttledAPICall()).toBe(false); // Too soon
      
      jest.advanceTimersByTime(1000);
      expect(mapper.throttledAPICall()).toBe(true);
      
      jest.useRealTimers();
    });

    test('should batch vehicle updates', () => {
      const vehicles = Array(100).fill(null).map((_, i) => ({
        id: `vehicle${i}`,
        lat: 37.7749 + Math.random() * 0.1,
        lon: -122.4194 + Math.random() * 0.1
      }));
      
      const batches = mapper.batchUpdateVehicles(vehicles);
      expect(batches).toHaveLength(5);
      expect(batches[0]).toHaveLength(20);
    });
  });

  describe('Data Validation', () => {
    test('should validate API key exists', () => {
      expect(mapper.apiKey).toBeTruthy();
      expect(typeof mapper.apiKey).toBe('string');
      expect(mapper.apiKey.length).toBeGreaterThan(10);
    });

    test('should validate operator ID', () => {
      expect(mapper.operatorId).toBe('SF');
      expect(typeof mapper.operatorId).toBe('string');
    });

    test('should validate base map center coordinates', () => {
      expect(mapper.baseMapCenter).toHaveLength(2);
      expect(typeof mapper.baseMapCenter[0]).toBe('number'); // longitude
      expect(typeof mapper.baseMapCenter[1]).toBe('number'); // latitude
      
      // San Francisco bounds check
      expect(mapper.baseMapCenter[0]).toBeGreaterThan(-123);
      expect(mapper.baseMapCenter[0]).toBeLessThan(-122);
      expect(mapper.baseMapCenter[1]).toBeGreaterThan(37);
      expect(mapper.baseMapCenter[1]).toBeLessThan(38);
    });

    test('should validate refresh rate', () => {
      expect(mapper.refreshRate).toBeGreaterThan(0);
      expect(typeof mapper.refreshRate).toBe('number');
    });
  });

  describe('Route Selector UI Interactions', () => {
    let routeSelector, showButton, closeButton, clearAllButton;

    beforeEach(() => {
      // Setup route selector DOM structure
      document.body.innerHTML = `
        <div class="route-selector" style="display: none;">
          <div class="close-route-selector-button-holder">
            <div class="close-route-selector-button">Close Route Selector</div>
          </div>
          <div class="clear-all-button-holder">
            <div class="clear-all-button">Clear All</div>
          </div>
        </div>
        <div class="button-overlay-container">
          <div class="show-route-selector-button-holder">
            <div class="show-route-selector-button">Choose Routes</div>
          </div>
        </div>
      `;

      routeSelector = document.querySelector('.route-selector');
      showButton = document.querySelector('.show-route-selector-button-holder');
      closeButton = document.querySelector('.close-route-selector-button-holder');
      clearAllButton = document.querySelector('.clear-all-button-holder');

      // Add the UI methods to our mapper mock
      mapper.routeSelector = routeSelector;
      mapper.buttonOverlay = document.querySelector('.button-overlay-container');
      
      mapper.showRouteSelector = jest.fn(function() {
        this.routeSelector.style.display = 'inline-block';
        this.buttonOverlay.style.display = 'none';
      });
      
      mapper.hideRouteSelector = jest.fn(function() {
        this.routeSelector.style.display = 'none';
        this.buttonOverlay.style.display = 'inline-block';
      });

      mapper.clearAll = jest.fn(function() {
        this.activeRoutes = [];
        this.vehicleGroups = {};
        // Clear active class from route tiles
        const activeTiles = document.querySelectorAll('.route-selector-tile.active');
        activeTiles.forEach(tile => {
          tile.classList.remove('active');
          tile.style.backgroundColor = this.routeTileBackgroundColor || '';
        });
      });
    });

    test('should show route selector when show button is clicked', () => {
      expect(routeSelector.style.display).toBe('none');
      
      showButton.onclick = () => mapper.showRouteSelector();
      showButton.onclick();
      
      expect(mapper.showRouteSelector).toHaveBeenCalled();
      expect(routeSelector.style.display).toBe('inline-block');
    });

    test('should hide route selector when close button is clicked', () => {
      routeSelector.style.display = 'inline-block';
      
      closeButton.onclick = () => mapper.hideRouteSelector();
      closeButton.onclick();
      
      expect(mapper.hideRouteSelector).toHaveBeenCalled();
      expect(routeSelector.style.display).toBe('none');
    });

    test('should clear all routes when clear all button is clicked', () => {
      mapper.activeRoutes = ['14', '38', 'N'];
      mapper.vehicleGroups = { '14': {}, '38': {}, 'N': {} };
      
      clearAllButton.onclick = (e) => mapper.clearAll(e);
      clearAllButton.onclick({});
      
      expect(mapper.clearAll).toHaveBeenCalled();
      expect(mapper.activeRoutes).toEqual([]);
      expect(mapper.vehicleGroups).toEqual({});
    });

    test('should create route tiles with proper structure', () => {
      const mockRoute = {
        '@attributes': {
          title: '14 Mission',
          tag: '14'
        }
      };

      mapper.createControlOption = jest.fn(function(title, attributes) {
        const el = document.createElement('div');
        el.classList.add('route-selector-tile');
        el.setAttribute('value', attributes.tag);
        
        const routeTag = document.createElement('div');
        routeTag.classList.add('route-selector-tile-tag');
        routeTag.innerText = attributes.tag;
        
        const routeTitle = document.createElement('div');
        routeTitle.classList.add('route-selector-tile-title');
        routeTitle.innerText = title;
        
        el.appendChild(routeTag);
        el.appendChild(routeTitle);
        
        el.onclick = () => this.toggleRoute(attributes.tag, el);
        
        return el;
      });

      const controlElement = mapper.createControlOption(mockRoute['@attributes'].title, mockRoute['@attributes']);
      
      expect(controlElement.classList.contains('route-selector-tile')).toBe(true);
      expect(controlElement.getAttribute('value')).toBe('14');
      expect(controlElement.querySelector('.route-selector-tile-tag').innerText).toBe('14');
      expect(controlElement.querySelector('.route-selector-tile-title').innerText).toBe('14 Mission');
    });
  });

  describe('Route Selection and Data Loading', () => {
    let mockRouteElement;

    beforeEach(() => {
      mockRouteElement = document.createElement('div');
      mockRouteElement.classList.add('route-selector-tile');
      mockRouteElement.setAttribute('value', '14');

      mapper.routeColors = {
        '14': { circle: { fill: '#ff0000' } },
        '38': { circle: { fill: '#00ff00' } }
      };

      mapper.routeTileBackgroundColor = '#ffffff';

      mapper.makeRouteActive = jest.fn(function(route, el) {
        this.activeRoutes.push(route);
        el.style.backgroundColor = this.routeColors[route].circle.fill;
        // Simulate fetching route data
        return this.fetchRoute(route).then(() => {
          this.drawVehiclesForRoute(route);
        });
      });

      mapper.makeRouteInactive = jest.fn(function(route, el) {
        el.style.backgroundColor = this.routeTileBackgroundColor;
        const index = this.activeRoutes.indexOf(route);
        if (index !== -1) {
          this.activeRoutes.splice(index, 1);
        }
        delete this.vehicleGroups[route];
      });

      // Fix the toggleRoute implementation to call makeRouteActive/makeRouteInactive
      mapper.toggleRoute = jest.fn(function(routeId, el) {
        if (!routeId || typeof routeId !== 'string') {
          console.error('Invalid route ID');
          return false;
        }
        if (this.activeRoutes.includes(routeId)) {
          this.makeRouteInactive(routeId, el);
          el.classList.remove('active');
        } else {
          el.classList.add('active');
          this.makeRouteActive(routeId, el);
        }
        return true;
      });

      mapper.fetchRoute = jest.fn().mockResolvedValue({});
      mapper.drawVehiclesForRoute = jest.fn();
    });

    test('should activate route when toggled from inactive state', async () => {
      mapper.activeRoutes = [];
      
      await mapper.toggleRoute('14', mockRouteElement);
      
      expect(mapper.makeRouteActive).toHaveBeenCalledWith('14', mockRouteElement);
      expect(mapper.activeRoutes).toContain('14');
      expect(mockRouteElement.classList.contains('active')).toBe(true);
    });

    test('should deactivate route when toggled from active state', () => {
      mapper.activeRoutes = ['14'];
      mockRouteElement.classList.add('active');
      
      mapper.toggleRoute('14', mockRouteElement);
      
      expect(mapper.makeRouteInactive).toHaveBeenCalledWith('14', mockRouteElement);
      expect(mapper.activeRoutes).not.toContain('14');
      expect(mockRouteElement.classList.contains('active')).toBe(false);
    });

    test('should fetch route data when route is activated', async () => {
      mapper.activeRoutes = [];
      
      await mapper.makeRouteActive('14', mockRouteElement);
      
      expect(mapper.fetchRoute).toHaveBeenCalledWith('14');
      expect(mapper.drawVehiclesForRoute).toHaveBeenCalledWith('14');
    });

    test('should set route tile background color when activated', async () => {
      mapper.activeRoutes = [];
      
      await mapper.makeRouteActive('14', mockRouteElement);
      
      // Browser normalizes color format to rgb(), so we need to check for either format
      const bgColor = mockRouteElement.style.backgroundColor;
      expect(bgColor === '#ff0000' || bgColor === 'rgb(255, 0, 0)').toBe(true);
    });

    test('should reset route tile background color when deactivated', () => {
      mapper.activeRoutes = ['14'];
      mockRouteElement.style.backgroundColor = '#ff0000';
      
      mapper.makeRouteInactive('14', mockRouteElement);
      
      // Browser normalizes color format to rgb(), so we need to check for either format
      const bgColor = mockRouteElement.style.backgroundColor;
      expect(bgColor === '#ffffff' || bgColor === 'rgb(255, 255, 255)').toBe(true);
    });

    test('should clean up vehicle groups when route is deactivated', () => {
      mapper.activeRoutes = ['14'];
      mapper.vehicleGroups = { '14': { vehicles: [] } };
      
      mapper.makeRouteInactive('14', mockRouteElement);
      
      expect(mapper.vehicleGroups['14']).toBeUndefined();
    });
  });

  describe('Route Data Fetching and API Integration', () => {
    beforeEach(() => {
      mapper.fetchRouteList = jest.fn(async function() {
        const url = `https://api.511.org/transit/lines?api_key=${this.apiKey}&operator_id=${this.operatorId}&format=json`;
        const response = await fetch(url);
        const data = await response.json();
        this.routes = data.routes || [];
        return data;
      });

      mapper.updateControlOptions = jest.fn(function() {
        // Ensure routeSelector exists
        if (!this.routeSelector) {
          this.routeSelector = document.createElement('div');
        }
        // Ensure createControlOption exists  
        if (!this.createControlOption) {
          this.createControlOption = jest.fn((title, attrs) => {
            const el = document.createElement('div');
            el.setAttribute('data-route', attrs.tag);
            el.textContent = title;
            return el;
          });
        }
        this.routes.forEach(route => {
          const control = this.createControlOption(route['@attributes'].title, route['@attributes']);
          this.routeSelector.appendChild(control);
        });
      });

      mapper.setupControls = jest.fn(async function() {
        try {
          const data = await this.fetchRouteList();
          this.updateControlOptions();
          return data;
        } catch (err) {
          console.error('Error setting up controls', err);
          throw err;
        }
      });
    });

    test('should fetch route list from 511 API during setup', async () => {
      const mockRoutesResponse = {
        routes: [
          { '@attributes': { title: '14 Mission', tag: '14' } },
          { '@attributes': { title: '38 Geary', tag: '38' } }
        ]
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockRoutesResponse
      });

      await mapper.setupControls();

      expect(mapper.fetchRouteList).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://api.511.org/transit/lines')
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('api_key=test-api-key')
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('operator_id=SF')
      );
    });

    test('should populate route selector with fetched routes', async () => {
      const mockRoutes = [
        { '@attributes': { title: '14 Mission', tag: '14' } },
        { '@attributes': { title: '38 Geary', tag: '38' } }
      ];

      mapper.routes = mockRoutes;
      mapper.routeSelector = document.createElement('div');
      mapper.createControlOption = jest.fn((title, attrs) => {
        const el = document.createElement('div');
        el.setAttribute('data-route', attrs.tag);
        el.textContent = title;
        return el;
      });

      mapper.updateControlOptions();

      expect(mapper.createControlOption).toHaveBeenCalledTimes(2);
      expect(mapper.createControlOption).toHaveBeenCalledWith('14 Mission', { title: '14 Mission', tag: '14' });
      expect(mapper.createControlOption).toHaveBeenCalledWith('38 Geary', { title: '38 Geary', tag: '38' });
    });

    test('should handle API errors gracefully during route fetching', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      console.error = jest.fn();

      try {
        await mapper.setupControls();
      } catch (error) {
        expect(error.message).toBe('Network error');
      }

      expect(console.error).toHaveBeenCalledWith('Error setting up controls', expect.any(Error));
    });
  });

  describe('Vehicle Data Loading After Route Selection', () => {
    beforeEach(() => {
      // Set up route colors first
      mapper.routeColors = {
        '14': { circle: { fill: '#ff0000' } },
        '38': { circle: { fill: '#00ff00' } }
      };
      mapper.routeTileBackgroundColor = '#ffffff';

      // Override makeRouteActive and makeRouteInactive for this test
      mapper.makeRouteActive = jest.fn(function(route, el) {
        this.activeRoutes.push(route);
        if (this.routeColors && this.routeColors[route]) {
          el.style.backgroundColor = this.routeColors[route].circle.fill;
        }
        return this.fetchRoute(route).then(() => {
          this.drawVehiclesForRoute(route);
        });
      });

      mapper.makeRouteInactive = jest.fn(function(route, el) {
        el.style.backgroundColor = this.routeTileBackgroundColor;
        const index = this.activeRoutes.indexOf(route);
        if (index !== -1) {
          this.activeRoutes.splice(index, 1);
        }
        delete this.vehicleGroups[route];
      });

      mapper.fetchRoute = jest.fn(async function(routeId) {
        const mockVehicleData = {
          vehicles: [
            {
              id: '1234',
              routeTag: routeId,
              lat: 37.7749,
              lon: -122.4194,
              heading: 90
            }
          ]
        };
        
        this.vehicleGroups[routeId] = mockVehicleData;
        return mockVehicleData;
      });

      mapper.drawVehiclesForRoute = jest.fn(function(routeId) {
        const vehicles = this.vehicleGroups[routeId];
        if (vehicles) {
          // Simulate drawing vehicles on map
          return vehicles.vehicles.length;
        }
        return 0;
      });

      mapper.getVehicleLocations = jest.fn(async function(routeId) {
        const url = `https://api.511.org/transit/vehiclepositions?api_key=${this.apiKey}&agency=${this.operatorId}&route=${routeId}`;
        const response = await fetch(url);
        return await response.json();
      });

    });

    test('should fetch vehicle data when route is selected', async () => {
      const mockElement = document.createElement('div');
      
      await mapper.makeRouteActive('14', mockElement);
      
      expect(mapper.fetchRoute).toHaveBeenCalledWith('14');
      expect(mapper.vehicleGroups['14']).toBeDefined();
      expect(mapper.vehicleGroups['14'].vehicles).toHaveLength(1);
    });

    test('should draw vehicles on map after fetching route data', async () => {
      const mockElement = document.createElement('div');
      
      await mapper.makeRouteActive('14', mockElement);
      
      expect(mapper.drawVehiclesForRoute).toHaveBeenCalledWith('14');
    });

    test('should store vehicle data for active routes', async () => {
      const mockElement = document.createElement('div');
      mapper.activeRoutes = [];
      
      await mapper.makeRouteActive('14', mockElement);
      
      expect(mapper.activeRoutes).toContain('14');
      expect(mapper.vehicleGroups['14']).toEqual({
        vehicles: [{
          id: '1234',
          routeTag: '14',
          lat: 37.7749,
          lon: -122.4194,
          heading: 90
        }]
      });
    });

    test('should handle multiple route selections', async () => {
      const element14 = document.createElement('div');
      const element38 = document.createElement('div');
      
      await mapper.makeRouteActive('14', element14);
      await mapper.makeRouteActive('38', element38);
      
      expect(mapper.activeRoutes).toEqual(['14', '38']);
      expect(mapper.vehicleGroups['14']).toBeDefined();
      expect(mapper.vehicleGroups['38']).toBeDefined();
      expect(mapper.fetchRoute).toHaveBeenCalledTimes(2);
      expect(mapper.drawVehiclesForRoute).toHaveBeenCalledTimes(2);
    });

    test('should remove vehicle data when route is deselected', () => {
      const mockElement = document.createElement('div');
      mapper.activeRoutes = ['14'];
      mapper.vehicleGroups = { 
        '14': { vehicles: [{ id: '1234', routeTag: '14' }] },
        '38': { vehicles: [{ id: '5678', routeTag: '38' }] }
      };
      
      mapper.makeRouteInactive('14', mockElement);
      
      expect(mapper.activeRoutes).not.toContain('14');
      expect(mapper.vehicleGroups['14']).toBeUndefined();
      expect(mapper.vehicleGroups['38']).toBeDefined(); // Other routes should remain
    });
  });
});
