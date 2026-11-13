// Only a packaged local marker is read. No localhost server, remote scripts, or eval.
export async function checkLocalUpdate({fetchFile, currentBuild, readBuild, reload}) {
  const response = await fetchFile('revision.json');
  if (!response.ok) return false;
  const revision = await response.json();
  if (!/^[a-f0-9]{64}$/.test(revision.build || '') || revision.build === currentBuild) return false;
  // The publisher writes build-id.mjs first and revision.json last. A partial save cannot trigger reload.
  const source = await readBuild();
  if (source.trim() !== `export const BUILD_ID = '${revision.build}';`) return false;
  await reload();
  return true;
}
export async function attachOpenPages(api, platforms, matchesTarget, matchesFrame) {
  const tabs = await api.tabs.query({url: Object.values(platforms).map(p => p.match)});
  for (const tab of tabs) {
    const platform = Object.keys(platforms).find(key => matchesTarget(key, tab.url));
    if (!platform) continue;
    try {
      const frames = await api.webNavigation.getAllFrames({tabId: tab.id});
      for (const frame of frames || []) {
        if (!matchesFrame(platform, frame.url)) continue;
        // Recheck the parent immediately before injection in case the shop was switched.
        if (!matchesTarget(platform, (await api.tabs.get(tab.id)).url)) break;
        await api.scripting.executeScript({target: {tabId: tab.id, frameIds: [frame.frameId]}, files: platforms[platform].files});
      }
    } catch { /* Closed/navigating tabs will attach through the manifest on their next load. */ }
  }
}
