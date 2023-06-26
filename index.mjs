#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import spawnAsync from './spawnAsync.mjs';

const workingDirectory = process.cwd();
const packageJson = JSON.parse(
  await fs.readFile(new URL('./package.json', import.meta.url))
);

let context = {
  templatePackage: 'mono-repo-with-parcel-template',
  appName: process.argv[2],
  templatePackageFileName: ''
};

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

async function checkPnpm() {
  let exists;
  try {
    exists = await spawnAsync('pnpm --version', {
      stdio: 'pipe'
    });
  } catch (e) {
    exists = false;
  }
  if (!exists) {
    console.log(
      "This template uses PNPM as it's Package Manager, which you currently do not have installed.\r\n\n" +
        'Check the installation guide for PNPM: https://pnpm.io/installation\r\n' +
        'After installing PNPM, start a fresh shell to have access to the global pnpm CLI.'
    );
    process.exit(1);
  }
}

(async () => {
  try {
    const program = new Command(packageJson.name)
      .version(packageJson.version)
      .arguments('[project-name]')
      .usage(`${chalk.green('<project-name>')} [options]`)
      .allowUnknownOption()
      .action((projectName) => {
        context.appName = projectName;
      });

    program.parse(process.argv);

    if (!context.appName) {
      console.log(`Please specify the project name:`);
      console.log(`  ${program.name()} ${chalk.green('<project-name>')}`);
      process.exit(1);
    }

    await checkPnpm();
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
