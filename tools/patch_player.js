
const fs = require('fs');

const file = '/var/www/netflix-clone/static/js/player.js';
let content = fs.readFileSync(file, 'utf8');

// Backup
fs.writeFileSync(file + '.bak_bein_fix_' + Date.now(), content);

// 1. Fix _antiLoopHandler in player.js
// The _antiLoopHandler was forcing video.currentTime = lastLiveMaxTime + 0.2 whenever a slight timing adjustment occurred on live streams.
// In live HLS streams, discontinuities and timestamp drift are normal. Forcing currentTime forward creates jumps, stuttering, and buffer underruns.
const oldAntiLoop = `    // Protection Anti-Rollback / Anti-Boucle Xtream UNIQUEMENT pour Live TV (JAMAIS sur VOD)
    if (isChannel) {
      this.lastLiveMaxTime = 0;
      this._antiLoopHandler = () => {
        if (!this.video.paused && !this.video.seeking) {
          const cur = this.video.currentTime;
          if (this.lastLiveMaxTime > 6 && cur < (this.lastLiveMaxTime - 2.0)) {
            console.warn(\`[Anti-Loop Xtream] Recalage direct : \${cur.toFixed(1)}s -> \${this.lastLiveMaxTime.toFixed(1)}s\`);
            this.video.currentTime = this.lastLiveMaxTime + 0.2;
            return;
          }
          if (cur > this.lastLiveMaxTime) {
            this.lastLiveMaxTime = cur;
          }
        }
      };
      this.video.addEventListener('timeupdate', this._antiLoopHandler, { signal });
    }`;

// We replace it with a safe passive tracker: only log if a severe loop occurs (e.g. rollback > 15s repeatedly), but DO NOT aggressively throw currentTime forward.
const newAntiLoop = `    // Protection Anti-Rollback / Anti-Boucle Xtream pour Live TV (Tolérance sécurisée)
    if (isChannel) {
      this.lastLiveMaxTime = 0;
      this._antiLoopStallCount = 0;
      this._antiLoopHandler = () => {
        if (!this.video.paused && !this.video.seeking) {
          const cur = this.video.currentTime;
          // Ne recalibrer que si le flux revient en arrière de plus de 15 secondes ET répété 5 fois
          if (this.lastLiveMaxTime > 20 && cur < (this.lastLiveMaxTime - 15.0)) {
            this._antiLoopStallCount++;
            if (this._antiLoopStallCount > 5) {
              this._antiLoopStallCount = 0;
              console.warn(\`[Anti-Loop Xtream] Recalage direct sécurisé : \${cur.toFixed(1)}s -> \${this.lastLiveMaxTime.toFixed(1)}s\`);
              this.video.currentTime = this.lastLiveMaxTime;
              return;
            }
          } else {
            this._antiLoopStallCount = 0;
          }
          if (cur > this.lastLiveMaxTime) {
            this.lastLiveMaxTime = cur;
          }
        }
      };
      this.video.addEventListener('timeupdate', this._antiLoopHandler, { signal });
    }`;

if (content.includes("this.lastLiveMaxTime > 6 && cur < (this.lastLiveMaxTime - 2.0)")) {
  content = content.replace(oldAntiLoop, newAntiLoop);
  console.log('✅ player.js antiLoopHandler safely smoothed!');
} else {
  console.warn('⚠️ Could not find exact oldAntiLoop pattern in player.js');
}

// 2. Fix currentTime += 0.3 in MEDIA_ERROR handler
// When MEDIA_ERROR happens, advancing currentTime += 0.3 on live channels was causing video frame skipping.
const oldMediaErr = `            } else if (this._mediaErrorCount <= 4) {
              // Avancer légèrement de 0.3s pour sauter la frame corrompue sur le seek
              if (this.video && !this.video.paused) {
                this.video.currentTime += 0.3;
              }
              hls.recoverMediaError();`;

const newMediaErr = `            } else if (this._mediaErrorCount <= 4) {
              // Sur direct (Live TV), laisser HLS.js récupérer sans forcer de seek artificiel
              if (!isChannel && this.video && !this.video.paused) {
                this.video.currentTime += 0.3;
              }
              hls.recoverMediaError();`;

if (content.includes(oldMediaErr)) {
  content = content.replace(oldMediaErr, newMediaErr);
  console.log('✅ player.js MEDIA_ERROR handler updated to avoid artificial seeks on Live TV!');
} else {
  console.warn('⚠️ Could not find exact oldMediaErr in player.js');
}

fs.writeFileSync(file, content, 'utf8');
console.log('✅ player.js saved successfully!');
