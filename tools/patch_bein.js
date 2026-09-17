
const fs = require('fs');

const file = '/var/www/netflix-clone/server.js';
let content = fs.readFileSync(file, 'utf8');

// Backup
fs.writeFileSync(file + '.bak_bein_fix_' + Date.now(), content);

// 1. Update H264_PREFERENCES
const oldPref = "'481109': '481108'  // DAZN 2 FR FHD -> HD (H.264)";
const newPref = `'481109': '481108', // DAZN 2 FR FHD -> HD (H.264)
        // beIN SPORTS MAX FR (FHD cluster instable -> HD H.264 vérifié 200 OK)
        '151958': '95',     // beIN Max 4 FHD -> HD
        '151961': '39882',  // beIN Max 5 FHD -> HD
        '151964': '1089',   // beIN Max 6 FHD -> HD
        '151967': '1113',   // beIN Max 7 FHD -> HD
        '151970': '1468',   // beIN Max 8 FHD -> HD
        '151973': '1469',   // beIN Max 9 FHD -> HD
        '151976': '1470',   // beIN Max 10 FHD -> HD
        // beIN SPORTS Arab streams (FHD est HEVC -> bascule automatique en HD H.264 pour navigateurs web)
        '13608': '13682',   // beIN 1 Arab FHD (HEVC) -> HD (H.264)
        '13607': '13680',   // beIN 2 Arab FHD (HEVC) -> HD (H.264)
        '13606': '13678',   // beIN 3 Arab FHD (HEVC) -> HD (H.264)
        '13605': '13676',   // beIN 4 Arab FHD (HEVC) -> HD (H.264)
        '13604': '13674',   // beIN 5 Arab FHD (HEVC) -> HD (H.264)
        '13603': '13672',   // beIN 6 Arab FHD (HEVC) -> HD (H.264)
        '13602': '13576',   // beIN 7 Arab FHD (HEVC) -> HD (H.264)
        '13611': '13688',   // beIN 8 Arab FHD (HEVC) -> HD (H.264)
        '13610': '13686',   // beIN 9 Arab FHD (HEVC) -> HD (H.264)
        '24979': '78372',   // beIN News Arab -> HD (H.264)
        '24980': '409586',  // beIN Global Arab -> HD (H.264)
        '21197': '21198',   // beIN NBA Arab -> HD (H.264)
        '165458': '165454', // beIN AFC 1 Arab -> HD (H.264)
        '165459': '165455', // beIN AFC 2 Arab -> HD (H.264)
        '165460': '165456', // beIN AFC 3 Arab -> HD (H.264)
        '129996': '129997', // beIN XTRA 1 Arab -> HD (H.264)
        '423814': '129999', // beIN XTRA 2 Arab -> HD (H.264)
        '129998': '423816', // beIN XTRA 3 Arab -> HD (H.264)
        '423822': '423821', // beIN XTRA 4 Arab -> HD (H.264)
        '423826': '423825', // beIN XTRA 5 Arab -> HD (H.264)
        '423830': '423829', // beIN XTRA 6 Arab -> HD (H.264)
        '423834': '423833', // beIN XTRA 7 Arab -> HD (H.264)
        '423838': '423837'  // beIN XTRA 8 Arab -> HD (H.264)`;

if (content.includes(oldPref)) {
  content = content.replace(oldPref, newPref);
  console.log('✅ H264_PREFERENCES successfully patched in server.js');
} else {
  console.warn('⚠️ Could not find oldPref in server.js');
}

// 2. Add Server 2 support for beIN Arab in extractChannelMultiProvider
const srv1Marker = "if (channel && channel.stream_id && srvNum === 1) {";
const srv1Block = `if (channel && channel.sources && channel.sources.hd_stream_id && srvNum === 2) {
    return {
      success: true,
      server: 2,
      server_name: 'Serveur 2 (HD 720p Stable H.264)',
      hoster: \`💎 Direct Xtream HD • \${title}\`,
      quality: 'HD 720p Direct VIP',
      title: \`\${title} • 🔴 EN DIRECT\`,
      stream_url: \`/api/stream/xtream?stream_id=\${channel.sources.hd_stream_id}\`,
      player_type: 'direct_hls',
      is_embed: false,
      is_live: true,
      sources_count: 8,
      lang: 'ar'
    };
  }

  if (channel && channel.stream_id && srvNum === 1) {`;

if (content.includes(srv1Marker)) {
  content = content.replace(srv1Marker, srv1Block);
  console.log('✅ extractChannelMultiProvider Server 2 added for beIN Arab!');
} else {
  console.warn('⚠️ Could not find srv1Marker');
}

fs.writeFileSync(file, content, 'utf8');
console.log('✅ server.js saved successfully!');
