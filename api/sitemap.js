const fs = require('fs');
const path = require('path');

module.exports = (req, res) => {
  try {
    const xml = fs.readFileSync(path.join(process.cwd(), 'sitemap.xml'), 'utf8');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(xml);
  } catch (e) {
    res.status(500).send('Could not read sitemap');
  }
};
