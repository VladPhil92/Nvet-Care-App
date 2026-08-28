'use strict';

const http = {
  get: () => null,
  post: () => null,
  put: () => null,
  delete: () => null,
  patch: () => null,
  all: () => null,
};

const HttpResponse = {
  json: (body, init) => ({ body, init }),
  text: (body, init) => ({ body, init }),
  error: () => ({}),
};

const delay = () => Promise.resolve();

module.exports = { http, HttpResponse, delay };
