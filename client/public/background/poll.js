// Background runner — Capacitor calls rosterPoll() periodically (~1h on
// Android). Limited environment: only CapacitorKV / CapacitorNotifications /
// fetch / console are available. No DOM, no React, no custom Capacitor
// plugins (so we CANNOT call the IRCrewHttp plugin from here).
//
// Strategy:
//   1. Read stored creds + period from CapacitorKV (written by the foreground
//      app whenever the user successfully logs in / picks a period).
//   2. POST CrewDelivery.dll with the creds to fetch the current roster HTML.
//   3. Reduce the HTML to a stable hash (just the table content) and compare
//      to the last hash we stored. If different, fire a local notification
//      AND write a "pending" flag the foreground app reads on next open.
//   4. If fetch fails (TLS chain not trusted by Android's default OkHttp,
//      etc.), log and bail — the foreground on-resume check will catch the
//      change as soon as the user opens the app.

addEventListener('rosterPoll', async (resolve, reject, _args) => {
  try {
    await pollOnce();
  } catch (e) {
    console.warn('rosterPoll failed:', String(e?.message ?? e));
  } finally {
    resolve();
  }
});

async function pollOnce() {
  const code = await CapacitorKV.get('bg.creds.code');
  const pass = await CapacitorKV.get('bg.creds.pass');
  const period = await CapacitorKV.get('bg.creds.period');
  if (!code || !pass || !period) {
    console.log('rosterPoll: no creds stored, skipping');
    return;
  }

  // Step 1: log in + fetch period rows from CrewDelivery.dll.
  const body = new URLSearchParams({
    Code: String(code),
    Pass: String(pass),
    TableType: 'DETAIL',
    Period: String(period),
  }).toString();

  let html = '';
  try {
    const r = await fetch('https://crew.iranair.com/CrewDelivery.dll', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (compatible; IRCrew/1.0)',
        Accept: '*/*',
      },
      body,
    });
    if (!r.ok) {
      console.log('rosterPoll: HTTP', r.status);
      return;
    }
    html = await r.text();
  } catch (e) {
    // Most likely TLS failure on the upstream cert chain — this happens
    // because the background runner's HTTP stack doesn't share our custom
    // relaxed-TLS OkHttp. Foreground check will catch the change later.
    console.log('rosterPoll: fetch error —', String(e?.message ?? e));
    return;
  }

  // Step 2: reduce to a stable hash of the table content (strip whitespace
  // so harmless reformat doesn't trigger a false positive).
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  const content = (tableMatch ? tableMatch[0] : html).replace(/\s+/g, ' ');
  const hash = djb2(content);

  const prev = await CapacitorKV.get('bg.lastHash');
  await CapacitorKV.set('bg.lastHash', String(hash));
  await CapacitorKV.set('bg.lastCheckAt', String(Date.now()));

  if (prev && prev !== String(hash)) {
    // Change detected — fire a notification AND flag for the foreground app.
    await CapacitorKV.set('bg.changeDetectedAt', String(Date.now()));
    try {
      await CapacitorNotifications.schedule({
        notifications: [{
          id: 1,
          title: 'برنامهٔ پرواز تغییر کرد',
          body: 'تغییری در روستر ماه جاری شما ثبت شد. برای جزئیات اپ را باز کنید.',
          smallIcon: 'ic_stat_icon_config_sample',
          channelId: 'ircrew-roster',
        }],
      });
    } catch (e) {
      console.warn('notification schedule failed:', String(e?.message ?? e));
    }
  }
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16);
}
