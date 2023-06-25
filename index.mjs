#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import spawn from 'cross-spawn';

const workingDirectory = process.cwd();

let context = {
  templatePackage: 'mono-repo-with-parcel-template',
  appName: process.argv[2],
  templatePackageFileName: ''
};

function spawnAsync(cmd, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, options);
    let result, error;
    if (options.stdio === 'pipe') {
      child.stdout.on('data', (d) => (result = d.toString()));
      child.stderr.on('data', (d) => (error = d.toString()));
    }
    child.once('exit', (code) => {
      if (code !== 0) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

async function initContext() {
  const tarballUrl = await spawnAsync(
    `npm view ${context.templatePackage} dist.tarball`,
    {
      stdio: 'pipe'
    }
  );
  context.templatePackageFileName = tarballUrl.split('-/')[1].trim();
}

async function downloadTemplateTarball() {
  await spawnAsync(`npm pack ${context.templatePackage}`, {
    stdio: 'pipe'
  });
  const exists = await fs.pathExists(context.templatePackageFileName);
  if (!exists) {
    throw new Error('Could not download package from NPM');
  }
}

async function extractPackage() {
  await spawnAsync(`tar -xf ${context.templatePackageFileName}`, {
    stdio: 'pipe'
  });
  await fs.remove(context.templatePackageFileName);
  await fs.copy(
    path.join(workingDirectory, 'package'),
    path.join(workingDirectory, context.appName)
  );
}

async function correctPackageJsonFiles() {
  const correctRootPackageJson = async () => {
    const packgeJsonPath = path.join(
      workingDirectory,
      context.appName,
      'package.json'
    );
    // "name", "version" and "private" are required to publish the package, but are
    // not necessary to be present in the final package.json.
    const {
      _name,
      _version,
      _files,
      private: _,
      ...rest
    } = await fs.readJson(packgeJsonPath);
    await fs.writeFile(packgeJsonPath, JSON.stringify(rest, null, 2));
  };
  const correctSubPackageJson = async () => {
    const packgeJsonPath = path.join(
      workingDirectory,
      context.appName,
      'packages/react-library/package.json'
    );
    const { _name, ...rest } = await fs.readJson(packgeJsonPath);
    await fs.writeFile(
      packgeJsonPath,
      JSON.stringify(
        {
          name: `@${context.appName}/react-library`,
          ...rest
        },
        null,
        2
      )
    );
  };

  await correctRootPackageJson();
  await correctSubPackageJson();
}

async function installPackages() {
  await spawnAsync('pnpm install', {
    stdio: 'inherit',
    cwd: path.join(workingDirectory, context.appName)
  });
}

async function runBuild() {
  await spawnAsync('pnpm build', {
    stdio: 'inherit',
    cwd: path.join(workingDirectory, context.appName)
  });
}

(async () => {
  try {
    await initContext();
    await downloadTemplateTarball();
    await extractPackage();
    await correctPackageJsonFiles();
    await fs.remove(path.join(workingDirectory, 'package'));
    console.log('Project created');
    await installPackages();
    await runBuild();
    console.log('Done!');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
