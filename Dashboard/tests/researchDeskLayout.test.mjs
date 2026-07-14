import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isFreeResearchPaperPosition,
  planExpandedResearchStacks,
  researchDeskCameraBounds,
  screenBoundsToResearchWorld,
} from "../src/components/panels/researchDeskLayout.ts";

const dashboardRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const worldBounds = screenBoundsToResearchWorld(
  { bottom: 440, left: 20, right: 620, top: 40 },
  { scale: 2, x: -100, y: 50 },
);
assert.deepEqual(worldBounds, { bottom: 195, left: 60, right: 360, top: -5 });

assert.equal(isFreeResearchPaperPosition(undefined), false);
assert.equal(isFreeResearchPaperPosition({ x: 0, y: 0 }), false);
assert.equal(isFreeResearchPaperPosition({ x: -1, y: 0 }), true);

const groups = [
  { key: "stack:subject:First", paperIds: ["alpha", "beta"] },
  { key: "stack:subject:Second", paperIds: ["gamma"] },
];
const stackPlan = planExpandedResearchStacks(groups, ["stack:subject:Second"]);
assert.deepEqual(stackPlan.map(({ expanded, groupOrder, key }) => ({ expanded, groupOrder, key })), [
  { expanded: false, groupOrder: 0, key: "stack:subject:First" },
  { expanded: true, groupOrder: 1, key: "stack:subject:Second" },
]);
assert.deepEqual(stackPlan[0].paperIds, ["alpha", "beta"]);
assert.notEqual(stackPlan[0].paperIds, groups[0].paperIds);
assert.deepEqual(groups[0].paperIds, ["alpha", "beta"]);

assert.deepEqual(researchDeskCameraBounds({
  contentHeight: 3000,
  contentWidth: 900,
  scale: 0.45,
  viewportHeight: 600,
  viewportWidth: 1000,
}), { maxX: 0, maxY: 0, minX: 0, minY: -814 });
assert.deepEqual(researchDeskCameraBounds({
  contentHeight: 3000,
  contentWidth: 900,
  scale: 0.12,
  viewportHeight: 600,
  viewportWidth: 1000,
}), { maxX: 0, maxY: 0, minX: 0, minY: 0 });
assert.deepEqual(researchDeskCameraBounds({
  contentHeight: 900,
  contentLeft: -420,
  contentTop: -160,
  contentWidth: 3000,
  scale: 0.5,
  viewportHeight: 700,
  viewportWidth: 1000,
}), { maxX: 274, maxY: 144, minX: -564, minY: 0 });

const workspaceSource = fs.readFileSync(path.join(dashboardRoot, "src", "components", "panels", "ResearchWorkspace.tsx"), "utf8");
const stylesSource = fs.readFileSync(path.join(dashboardRoot, "src", "styles", "globals.css"), "utf8");
assert.match(workspaceSource, /"--stack-offset-x": `\$\{expanded \? 0 : stackPosition\.x\}px`/);
assert.match(workspaceSource, /"--stack-heading-offset-x": `\$\{expanded \? stackPosition\.x : 0\}px`/);
assert.doesNotMatch(workspaceSource, /stackCorrections?|stackCorrection/);
assert.match(workspaceSource, /const correction = correctionFor\(worldRect\(element\), \{\s*x: position\.x - original\.x,\s*y: position\.y - original\.y,/);
assert.match(workspaceSource, /contentLeft = Math\.min\(contentLeft, \(elementRect\.left - worldRect\.left\) \/ renderedWorldScale\)/);
assert.match(workspaceSource, /contentHeight:[^\n]+\n\s+contentLeft,\n\s+contentTop,/);
assert.doesNotMatch(workspaceSource, /delete\s+next\[`paper:/);
assert.doesNotMatch(workspaceSource, /renderedDeskSignature/);
assert.match(workspaceSource, /const next = connectedDrop[\s\S]*x: drag\.origin\.x,[\s\S]*y: drag\.origin\.y,/);
assert.match(stylesSource, /\.research-paper-stack-expanded\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s);
assert.match(stylesSource, /\.research-desk-canvas\s*\{[^}]*overflow:\s*clip;/s);
assert.match(stylesSource, /\.research-paper-stack-cards\.research-paper-stack-spread\s*\{[^}]*height:\s*auto;[^}]*grid-auto-flow:\s*row;/s);
assert.match(stylesSource, /\.research-desk-zoom-detail \.research-paper-detail-copy\s*\{[^}]*font-size:\s*0\.44rem;[^}]*-webkit-line-clamp:\s*7;/s);
assert.doesNotMatch(stylesSource, /research-desk-zoom-(?:close|detail)[^{]*research-spread-paper\s*\{[^}]*height:/s);
assert.match(workspaceSource, /Math\.min\(1, \(rect\.height - 42\) \/ contentHeight, widthScale\), 0\.12, 1/);
assert.match(workspaceSource, /Math\.exp\(-delta \* 0\.0014\), 0\.12, 4/);

console.log("RESEARCH DESK LAYOUT PASS");
