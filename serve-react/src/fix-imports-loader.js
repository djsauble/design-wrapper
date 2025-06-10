/**
 * A custom Webpack loader to make on-the-fly modifications to a file.
 *
 * @param {string} source The original source code of the file.
 * @returns {string} The modified source code.
 */
module.exports = function (source) {
  console.log('Running custom loader on:', this.resourcePath);

  let modifiedSource = source;

  // 1. Add 'import React from "react"' if it's missing.
  // This is necessary for older JSX transforms that don't do it automatically.
  if (!/import React from ['"]react['"]/.test(source)) {
    modifiedSource = `import React from 'react';\n${modifiedSource}`;
    console.log('Added React import.');
  }

  // 2. Replace absolute paths with a relative one (defaults to '../public' for now even though it's vite specific)
  const absoluteAssetPathRegex = /(['"])(\/.*)(['"])/g;
  modifiedSource = modifiedSource.replace(absoluteAssetPathRegex, (match, quote1, path, quote2) => {
    // quote1 is the opening quote (e.g., ')
    // path is the captured absolute path (e.g., /vite.svg)
    // quote2 is the closing quote (e.g., ')
    const newPath = `../public${path}`;
    console.log(`Rewriting absolute path: "${path}" to "${newPath}"`);
    return `${quote1}${newPath}${quote2}`;
  });

  // You can add more transformations here as needed.

  return modifiedSource;
};
