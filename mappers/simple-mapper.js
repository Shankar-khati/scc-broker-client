const Hasher = require('../hasher');

function SimpleMapper() {
  this.hasher = new Hasher();
  this.sites = [];
}

SimpleMapper.prototype.setSites = function (sites) {
  this.sites = sites;
};

SimpleMapper.prototype.getSites = function () {
  return this.sites;
};

SimpleMapper.prototype.findSite = function (key) {
  key = this.hasher.hashToHex(key);
  let sites = this.sites;
  let targetIndex = this.hasher.hashToIndex(key, sites.length);
  return sites[targetIndex];
};

module.exports = SimpleMapper;
