#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function discoverWorkspaceImporters(rootManifest) {
    const importers = [];

    for (const pattern of rootManifest.workspaces ?? []) {
        if (!pattern.endsWith('/*')) {
            throw new Error(`Unsupported workspace pattern: ${pattern}`);
        }

        const parent = pattern.slice(0, -2);
        const parentPath = path.join(rootDir, parent);
        const directories = fs
            .readdirSync(parentPath, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => `${parent}/${entry.name}`)
            .filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath, 'package.json')))
            .sort();

        for (const relativePath of directories) {
            importers.push({
                key: relativePath,
                manifest: readJson(`${relativePath}/package.json`),
            });
        }
    }

    return importers;
}

function normalizePnpmVersion(version) {
    if (typeof version !== 'string') return undefined;
    const peerContextStart = version.indexOf('(');
    return peerContextStart === -1 ? version : version.slice(0, peerContextStart);
}

function resolveNpmVersion(npmPackages, importerKey, dependencyName) {
    const candidates = [];
    if (importerKey !== '.') {
        candidates.push(`${importerKey}/node_modules/${dependencyName}`);
    }
    candidates.push(`node_modules/${dependencyName}`);

    for (const candidate of candidates) {
        const version = npmPackages[candidate]?.version;
        if (version) return version;
    }

    return undefined;
}

function compareDirectResolutions(importers, internalNames, pnpmLock, npmLock) {
    const errors = [];
    let compared = 0;

    for (const { key, manifest } of importers) {
        const pnpmImporter = pnpmLock.importers?.[key];
        if (!pnpmImporter) {
            errors.push(`${key}: missing pnpm importer`);
            continue;
        }

        for (const section of ['dependencies', 'devDependencies']) {
            for (const dependencyName of Object.keys(manifest[section] ?? {})) {
                if (internalNames.has(dependencyName)) continue;

                compared += 1;
                const pnpmEntry = pnpmImporter[section]?.[dependencyName];
                const pnpmVersion = normalizePnpmVersion(
                    typeof pnpmEntry === 'string' ? pnpmEntry : pnpmEntry?.version,
                );
                const npmVersion = resolveNpmVersion(npmLock.packages ?? {}, key, dependencyName);
                const label = `${key} ${section}.${dependencyName}`;

                if (!pnpmVersion) {
                    errors.push(`${label}: missing pnpm resolution`);
                } else if (!npmVersion) {
                    errors.push(`${label}: missing npm resolution`);
                } else if (pnpmVersion !== npmVersion) {
                    errors.push(`${label}: npm=${npmVersion}, pnpm=${pnpmVersion}`);
                }
            }
        }
    }

    return { compared, errors };
}

function checkReleaseBuildCoverage(workspaceImporters) {
    const errors = [];
    const requiredNames = new Set(
        workspaceImporters
            .filter(({ manifest }) => manifest.scripts?.build)
            .map(({ manifest }) => manifest.name),
    );
    const buildScript = fs.readFileSync(path.join(rootDir, 'scripts/build-release-inputs.sh'), 'utf8');
    const counts = new Map();
    const workspaceBuildLines = [];
    const startosBuildLines = [];
    const buildCommandPattern = /^npm\s+run\s+build\s+--workspace(?:=|\s+)([^\s]+)/;
    const startosCommandPattern = /^npm\s+run\s+build:startos(?:\s|$)/;
    const activeLines = buildScript
        .split(/\r?\n/)
        .map((source, index) => ({ index, source: source.trim() }))
        .filter(({ source }) => source && !source.startsWith('#'));

    for (const { index, source } of activeLines) {
        const workspaceMatch = source.match(buildCommandPattern);
        if (workspaceMatch) {
            const workspaceName = workspaceMatch[1];
            counts.set(workspaceName, (counts.get(workspaceName) ?? 0) + 1);
            workspaceBuildLines.push(index);
        }
        if (startosCommandPattern.test(source)) startosBuildLines.push(index);
    }

    for (const workspaceName of requiredNames) {
        const count = counts.get(workspaceName) ?? 0;
        if (count !== 1) {
            errors.push(`release build workspace ${workspaceName}: expected exactly once, found ${count}`);
        }
    }

    for (const [workspaceName, count] of counts) {
        if (!requiredNames.has(workspaceName)) {
            errors.push(`release build workspace ${workspaceName}: unexpected build command (${count})`);
        }
    }

    if (startosBuildLines.length !== 1) {
        errors.push(`release build StartOS bundle: expected exactly once, found ${startosBuildLines.length}`);
    } else if (workspaceBuildLines.some((line) => line > startosBuildLines[0])) {
        errors.push('release build StartOS bundle: must run after all workspace builds');
    }

    return { required: requiredNames.size, errors };
}

const rootManifest = readJson('package.json');
const workspaceImporters = discoverWorkspaceImporters(rootManifest);
const importers = [{ key: '.', manifest: rootManifest }, ...workspaceImporters];
const internalNames = new Set(workspaceImporters.map(({ manifest }) => manifest.name));
const pnpmLock = parseYaml(fs.readFileSync(path.join(rootDir, 'pnpm-lock.yaml'), 'utf8'));
const npmLock = readJson('package-lock.json');

const resolutionResult = compareDirectResolutions(importers, internalNames, pnpmLock, npmLock);
const buildResult = checkReleaseBuildCoverage(workspaceImporters);
const errors = [...resolutionResult.errors, ...buildResult.errors];

if (errors.length > 0) {
    process.stderr.write(`Lock consistency check failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(
        `Lock consistency check passed for ${resolutionResult.compared} external direct dependencies across ${importers.length} importers; release build covers ${buildResult.required} workspaces and the StartOS bundle exactly once.\n`,
    );
}
