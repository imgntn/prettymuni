// Browser environment setup for Jest
const { TextEncoder, TextDecoder } = require('util');

// Add TextEncoder/TextDecoder globals for Node 18 compatibility
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { JSDOM } = require('jsdom');

// Setup DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="map"></div></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
  resources: 'usable'
});

global.window = dom.window;
global.document = window.document;
global.navigator = window.navigator;
global.requestAnimationFrame = (callback) => setTimeout(callback, 0);
global.cancelAnimationFrame = (id) => clearTimeout(id);

// Mock localStorage
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// Mock fetch API
global.fetch = jest.fn();

// Mock XMLHttpRequest for D3
global.XMLHttpRequest = window.XMLHttpRequest;

// Mock console methods
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

// Mock protobufjs if needed
global.protobuf = {
  Root: jest.fn().mockImplementation(() => ({
    fromJSON: jest.fn().mockReturnThis(),
    lookupType: jest.fn().mockReturnValue({
      decode: jest.fn()
    })
  }))
};