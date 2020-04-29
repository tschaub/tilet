async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(
      `unexpected response status from ${url}: ${response.status}`
    );
  }

  return await response.json();
}

function getTileMatrixSetLink(tilesInfo, tileMatrixSetId) {
  for (const link of tilesInfo.tileMatrixSetLinks) {
    if (link.tileMatrixSet === tileMatrixSetId) {
      return link;
    }
  }
  throw new Error(`no URL found for ${tileMatrixSetId}`);
}

function getTileURLTemplate(tilesInfo) {
  for (const link of tilesInfo.links) {
    if (link.rel === 'item' && link.templated) {
      return link.href;
    }
  }
  throw new Error('no tile URL template found');
}

function getLevels(matrices, limits) {
  const lookup = {};
  for (const matrix of matrices) {
    lookup[matrix.identifier] = matrix;
  }

  const levels = limits.map(limit => {
    const matrix = lookup[limit.tileMatrix];
    if (!matrix) {
      throw new Error(`missing level ${limit.tileMatrix} in matrix`);
    }
    return {matrix, limit};
  });

  levels.sort((a, b) => (a.matrix.resolution > b.matrix.resolution ? -1 : 1));
  return levels;
}

function getURL(template, values) {
  return template.replace(/\{(\w+?)\}/g, (match, key) => {
    if (key in values) {
      return values[key];
    }
    return match;
  });
}

function getTiles(bounds, level, template) {
  const tileWidth = level.matrix.tileWidth;
  const tileHeight = level.matrix.tileHeight;

  const tileResolution = level.matrix.resolution;
  const mapTileWidth = tileWidth * tileResolution;
  const mapTileHeight = tileHeight * tileResolution;

  const minCol = Math.max(
    level.limit.minTileCol,
    Math.floor((bounds[0] - level.matrix.left) / mapTileWidth)
  );

  const minRow = Math.max(
    level.limit.minTileRow,
    Math.floor((level.matrix.top - bounds[3]) / mapTileHeight)
  );

  const maxCol = Math.min(
    level.limit.maxTileCol,
    Math.ceil((bounds[2] - level.matrix.left) / mapTileWidth)
  );

  const maxRow = Math.min(
    level.limit.maxTileRow,
    Math.ceil((level.matrix.top - bounds[1]) / mapTileHeight)
  );

  const tiles = [];
  for (let row = minRow; row <= maxRow; ++row) {
    for (let col = minCol; col <= maxCol; ++col) {
      const tileLeft = level.matrix.left + col * mapTileWidth;
      const tileTop = level.matrix.top - row * mapTileHeight;
      const tileBounds = [
        tileLeft,
        tileTop - mapTileHeight,
        tileLeft + mapTileWidth,
        tileTop
      ];

      const values = {
        tileMatrix: level.matrix.identifier,
        tileCol: col,
        tileRow: row
      };

      tiles.push({
        url: getURL(template, values),
        width: tileWidth,
        height: tileHeight,
        bounds: tileBounds
      });
    }
  }

  return tiles;
}

function render(context, center, zoom, levels, template) {
  const level = levels[zoom];

  const canvasHalfWidth = context.canvas.width / 2;
  const canvasHalfHeight = context.canvas.height / 2;

  const tileResolution = level.matrix.resolution;

  const mapHalfWidth = canvasHalfWidth * tileResolution;
  const mapHalfHeight = canvasHalfHeight * tileResolution;

  const bounds = [
    center[0] - mapHalfWidth,
    center[1] - mapHalfHeight,
    center[0] + mapHalfWidth,
    center[1] + mapHalfHeight
  ];

  const tiles = getTiles(bounds, level, template);

  tiles.forEach(tile => {
    const image = new Image();
    const dx = canvasHalfWidth + (tile.bounds[0] - center[0]) / tileResolution;
    const dy = canvasHalfHeight - (tile.bounds[3] - center[1]) / tileResolution;
    image.addEventListener('load', () => {
      context.drawImage(image, dx, dy);
    });
    image.src = tile.url;
  });
}

async function main() {
  const script = document.currentScript;

  const tilesInfoURL = script.dataset.tiles;
  const tilesInfo = await fetchJSON(tilesInfoURL);

  const tileURLTemplate = getTileURLTemplate(tilesInfo);

  const tileMatrixSetId = script.dataset.tileMatrixSet;
  const tileMatrixSetLink = getTileMatrixSetLink(tilesInfo, tileMatrixSetId);
  const tileMatrixSet = await fetchJSON(tileMatrixSetLink.tileMatrixSetURI);

  const levels = getLevels(
    tileMatrixSet.tileMatrix,
    tileMatrixSetLink.tileMatrixSetLimits
  );

  const container = document.getElementById(script.dataset.map);
  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    width: '100%',
    height: '100%'
  });
  canvas.height = container.clientHeight;
  canvas.width = container.clientWidth;
  container.appendChild(canvas);
  const context = canvas.getContext('2d');

  const values = {};
  script.dataset.values.split('&').forEach(set => {
    const [key, value] = set.split('=');
    values[key] = value;
  });
  values.tileMatrixSetId = tileMatrixSetId;

  const center = script.dataset.center
    .split(',')
    .map(value => parseFloat(value, 10));

  const zoom = parseInt(script.dataset.zoom, 10);

  render(context, center, zoom, levels, getURL(tileURLTemplate, values));
}

main();
