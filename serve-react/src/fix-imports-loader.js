const path = require('path');

/**
 * A custom Webpack loader to make on-the-fly modifications to a file.
 *
 * @param {string} source The original source code of the file.
 * @returns {string} The modified source code.
 */
module.exports = function (source) {
  const options = this.getOptions();
  const assetRoot = options.assetRoot;
  let modifiedSource = source;

  // 1. Add 'import React from "react"' if it's missing.
  // This is necessary for older JSX transforms that don't do it automatically.
  if (!/import React from ['"]react['"]/.test(source)) {
    modifiedSource = `import React from 'react';\n${modifiedSource}`;
    console.log('Added React import.');
  }

  // If the assetRoot option isn't provided, we can't rewrite paths.
  // We'll issue a warning and skip the path rewriting transformation.
  if (!assetRoot) {
    // Check if there are any absolute paths that need converting. If so, warn the user.
    if (/(['"])(\/.*)(['"])/.test(modifiedSource)) {
         this.emitWarning(
            new Error(`[fix-imports-loader] Loader option "assetRoot" is not set, but absolute paths were found in ${path.basename(this.resourcePath)}. Path rewriting is skipped.`)
         );
    }
    return modifiedSource;
  }

  // 2. Replace absolute paths with relative ones.
  const resourceDir = path.dirname(this.resourcePath);
  const absoluteAssetPathRegex = /(['"])(\/.*)(['"])/g;
  modifiedSource = modifiedSource.replace(absoluteAssetPathRegex, (match, quote1, absoluteWebPath, quote2) => {
    // absoluteWebPath is the path from the import, e.g., '/vite.svg'
    // We need to resolve this against the assetRoot to get the full file system path.
    const fullAssetPathOnDisk = path.join(assetRoot, absoluteWebPath);

    // Now, calculate the relative path from the current file's directory to the asset's location.
    let relativePath = path.relative(resourceDir, fullAssetPathOnDisk);

    // For web paths, we need forward slashes, even on Windows.
    relativePath = relativePath.split(path.sep).join('/');

    // For imports, it's good practice to ensure the path starts with './' or '../'.
    if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
      relativePath = './' + relativePath;
    }

    console.log(`[fix-imports-loader] Rewriting path in ${path.basename(this.resourcePath)}: "${absoluteWebPath}" -> "${relativePath}"`);

    // Return the modified string with the original quotes.
    return `${quote1}${relativePath}${quote2}`;
  });

  // You can add more transformations here as needed.

  return modifiedSource;
};
