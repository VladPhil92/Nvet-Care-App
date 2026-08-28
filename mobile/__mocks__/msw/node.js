'use strict';

function setupServer(..._handlers) {
  return {
    listen: () => {},
    close: () => {},
    resetHandlers: () => {},
    use: () => {},
  };
}

module.exports = { setupServer };
