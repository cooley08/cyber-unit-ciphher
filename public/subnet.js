// Subnet math + practice question generator.
// Works in the browser (window.Subnet) and in Node (module.exports) for testing.
(function (root) {
  'use strict';

  // ---------- core helpers ----------
  function parseIp(str) {
    if (typeof str !== 'string') return null;
    const parts = str.trim().split('.');
    if (parts.length !== 4) return null;
    let n = 0;
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const v = Number(p);
      if (v > 255) return null;
      n = n * 256 + v;
    }
    return n >>> 0;
  }

  function intToIp(n) {
    n = n >>> 0;
    return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  }

  function octet(n, idx) {
    return (n >>> (24 - idx * 8)) & 255;
  }

  function cidrToMask(c) {
    return c === 0 ? 0 : (0xFFFFFFFF << (32 - c)) >>> 0;
  }

  function maskToCidr(m) {
    m = m >>> 0;
    for (let c = 0; c <= 32; c++) if (cidrToMask(c) === m) return c;
    return null;
  }

  function toBinary(n) {
    return (n >>> 0).toString(2).padStart(32, '0');
  }

  function ipClass(ip) {
    const a = ip >>> 24;
    if (a < 128) return 'A';
    if (a < 192) return 'B';
    if (a < 224) return 'C';
    if (a < 240) return 'D (multicast)';
    return 'E (experimental)';
  }

  function addressType(ip) {
    const a = ip >>> 24, b = (ip >>> 16) & 255;
    if (a === 10) return 'Private (RFC 1918)';
    if (a === 172 && b >= 16 && b <= 31) return 'Private (RFC 1918)';
    if (a === 192 && b === 168) return 'Private (RFC 1918)';
    if (a === 127) return 'Loopback';
    if (a === 169 && b === 254) return 'Link-local (APIPA)';
    if (a === 100 && b >= 64 && b <= 127) return 'Carrier-grade NAT (RFC 6598)';
    if (a === 0) return 'Reserved ("this network")';
    if (a >= 224 && a <= 239) return 'Multicast';
    if (a >= 240) return 'Reserved';
    return 'Public';
  }

  // Accepts "192.168.1.10/24", "192.168.1.10 255.255.255.0", "192.168.1.10/255.255.255.0"
  function parseInput(str) {
    const s = (str || '').trim();
    if (!s) return { error: 'Enter an address like 192.168.1.10/24' };
    const m = s.match(/^([\d.]+)\s*(?:\/\s*|\s+)([\d.]+)$/);
    if (!m) {
      if (parseIp(s) !== null) return { error: 'Add a prefix (like /24) or a mask (like 255.255.255.0) after the IP.' };
      return { error: 'Use the format 192.168.1.10/24 or 192.168.1.10 255.255.255.0' };
    }
    const ip = parseIp(m[1]);
    if (ip === null) return { error: `"${m[1]}" isn't a valid IPv4 address. Each of the 4 octets must be 0–255.` };
    let cidr;
    if (/^\d{1,2}$/.test(m[2])) {
      cidr = Number(m[2]);
      if (cidr > 32) return { error: 'Prefix length must be between /0 and /32.' };
    } else {
      const mask = parseIp(m[2]);
      if (mask === null) return { error: `"${m[2]}" isn't a valid prefix or subnet mask.` };
      cidr = maskToCidr(mask);
      if (cidr === null) return { error: `${m[2]} isn't a valid mask. Mask bits must be all 1s followed by all 0s (e.g. 255.255.255.0).` };
    }
    return { ip, cidr };
  }

  function calculate(ip, cidr) {
    const mask = cidrToMask(cidr);
    const wildcard = (~mask) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | wildcard) >>> 0;
    const total = Math.pow(2, 32 - cidr);
    let first, last, usable;
    if (cidr === 32) { first = last = ip; usable = 1; }
    else if (cidr === 31) { first = network; last = broadcast; usable = 2; }
    else { first = network + 1; last = broadcast - 1; usable = total - 2; }
    return { ip, cidr, mask, wildcard, network, broadcast, first: first >>> 0, last: last >>> 0, total, usable };
  }

  function blockStarts(block) {
    const starts = [];
    for (let s = 0; s < 256 && starts.length < 4; s += block) starts.push(s);
    return starts.join(', ') + (block * 4 < 256 ? ', …' : '');
  }

  const ORD = ['1st', '2nd', '3rd', '4th'];

  // Step-by-step "magic number" working for network/broadcast/hosts
  function explainRange(ip, cidr) {
    const r = calculate(ip, cidr);
    const steps = [];
    const maskStr = intToIp(r.mask);
    if (cidr === 32) {
      steps.push(`A /32 has 0 host bits, so it describes exactly one address: ${intToIp(ip)}. It's used for single-host routes and loopbacks.`);
      return steps;
    }
    if (cidr % 8 === 0) {
      const keep = cidr / 8;
      steps.push(`/${cidr} = ${maskStr}. This lines up with a whole octet, so no division needed.`);
      if (keep === 0) {
        steps.push('Network: /0 means every bit is a host bit, so the network is 0.0.0.0.');
        steps.push('Broadcast: 255.255.255.255.');
      } else {
        steps.push(`Network: keep the first ${keep} octet${keep > 1 ? 's' : ''}, set the rest to 0. Result: ${intToIp(r.network)}`);
        steps.push(`Broadcast: keep the first ${keep} octet${keep > 1 ? 's' : ''}, set the rest to 255. Result: ${intToIp(r.broadcast)}`);
      }
    } else {
      const idx = Math.floor(cidr / 8);
      const maskOct = octet(r.mask, idx);
      const block = 256 - maskOct;
      const ipOct = octet(ip, idx);
      const q = Math.floor(ipOct / block);
      const netOct = q * block;
      const ord = ORD[idx];
      const later = idx < 3 ? '; later octets become 0' : '';
      const laterB = idx < 3 ? '; later octets become 255' : '';
      steps.push(`/${cidr} = ${maskStr}. The ${ord} octet (${maskOct}) is where the mask splits.`);
      steps.push(`Block size = 256 - ${maskOct} = ${block}. Subnets start at ${blockStarts(block)}`);
      steps.push(`The IP's ${ord} octet is ${ipOct}. ${ipOct} / ${block} = ${q} remainder ${ipOct - netOct}, so the block starts at ${q} x ${block} = ${netOct}.`);
      steps.push(`Network: ${ord} octet becomes ${netOct}${later}. Result: ${intToIp(r.network)}`);
      steps.push(`Broadcast: next block starts at ${netOct + block}, minus 1 is ${netOct + block - 1}${laterB}. Result: ${intToIp(r.broadcast)}`);
    }
    const h = 32 - cidr;
    if (cidr === 31) {
      steps.push(`A /31 has 1 host bit → 2 addresses. RFC 3021 lets point-to-point links use both, so there's no separate network/broadcast in practice.`);
    } else {
      steps.push(`Usable hosts: 2^${h} - 2 = ${r.usable.toLocaleString('en-US')}. Range: ${intToIp(r.first)} to ${intToIp(r.last)}.`);
    }
    return steps;
  }

  function explainMask(cidr) {
    const mask = cidrToMask(cidr);
    const bin = toBinary(mask).match(/.{8}/g).join('.');
    const steps = [`/${cidr} means ${cidr} one-bits followed by ${32 - cidr} zero-bits: ${bin}`];
    const full = Math.floor(cidr / 8);
    const rem = cidr % 8;
    if (full > 0) steps.push(`The first ${full} octet${full > 1 ? 's are' : ' is'} all 1s → 255.`);
    if (rem > 0) {
      const vals = [128, 64, 32, 16, 8, 4, 2, 1].slice(0, rem);
      steps.push(`The ${ORD[full]} octet has ${rem} one-bit${rem > 1 ? 's' : ''}: ${vals.join(' + ')} = ${vals.reduce((a, b) => a + b, 0)}.`);
    }
    steps.push(`Remaining octets are 0 → ${intToIp(mask)}`);
    steps.push('Shortcut: the possible octet values are 128, 192, 224, 240, 248, 252, 254, 255 (1–8 bits).');
    return steps;
  }

  // ---------- subnet planner (VLSM) ----------
  // Smallest prefix with room for n usable hosts (minimum /30)
  function prefixForHosts(n) {
    let bits = 2;
    while (Math.pow(2, bits) - 2 < n) bits++;
    return 32 - bits;
  }

  // Split an address range into the fewest aligned CIDR blocks
  function freeBlocks(start, end) {
    const out = [];
    while (start <= end) {
      let size = 1;
      while (size * 2 <= end - start + 1 && start % (size * 2) === 0) size *= 2;
      out.push({ network: start >>> 0, cidr: 32 - Math.log2(size), size });
      start += size;
    }
    return out;
  }

  // requests: [{ name, hosts }]. Largest first, so every block lands on a boundary it fits.
  function planSubnets(baseIp, baseCidr, requests) {
    const base = calculate(baseIp, baseCidr);
    const end = base.network + base.total - 1;
    const sorted = requests
      .map((r, i) => Object.assign({}, r, { index: i, cidr: prefixForHosts(r.hosts) }))
      .sort((a, b) => a.cidr - b.cidr || a.index - b.index);

    let cursor = base.network;
    let needed = 0;
    const allocations = sorted.map((r) => {
      const size = Math.pow(2, 32 - r.cidr);
      needed += size;
      const a = {
        name: r.name, hosts: r.hosts, index: r.index, cidr: r.cidr, size,
        reason: `${r.name}: ${r.hosts.toLocaleString('en-US')} hosts + 2 = ${(r.hosts + 2).toLocaleString('en-US')} addresses, rounded up to ${size.toLocaleString('en-US')} = /${r.cidr}`
      };
      a.fits = r.cidr >= baseCidr && cursor + size - 1 <= end;
      if (a.fits) {
        const c = calculate(cursor, r.cidr);
        Object.assign(a, { network: c.network, broadcast: c.broadcast, first: c.first, last: c.last, usable: c.usable });
        cursor += size;
      }
      return a;
    });

    const fitsAll = allocations.every((a) => a.fits);
    let suggest = null;
    if (!fitsAll) {
      let p = baseCidr;
      while (p > 0 && Math.pow(2, 32 - p) < needed) p--;
      suggest = { cidr: p, network: calculate(base.network, p).network };
    }
    return {
      base, allocations, fitsAll, needed, suggest,
      used: cursor - base.network,
      total: base.total,
      free: cursor <= end ? freeBlocks(cursor, end) : []
    };
  }

  // ---------- practice questions ----------
  const TYPES = {
    network: 'Network address',
    broadcast: 'Broadcast address',
    firstHost: 'First usable host',
    lastHost: 'Last usable host',
    usableHosts: 'Usable hosts',
    maskForCidr: 'CIDR → mask',
    cidrForMask: 'Mask → CIDR',
    hostsNeeded: 'Size a subnet',
    subnetCount: 'Count subnets',
    sameSubnet: 'Same subnet?'
  };

  const DIFFICULTY = {
    easy:   { cidr: [24, 30], maxHosts: 126,   base: [24, 24] },
    medium: { cidr: [16, 30], maxHosts: 4000,  base: [16, 24] },
    hard:   { cidr: [8, 30],  maxHosts: 60000, base: [8, 24] }
  };

  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  function fromOctets(a, b, c, d) {
    return ((a * 16777216) + (b << 16) + (c << 8) + d) >>> 0;
  }

  function randomIp() {
    switch (randInt(0, 3)) {
      case 0: return fromOctets(10, randInt(0, 255), randInt(0, 255), randInt(1, 254));
      case 1: return fromOctets(172, randInt(16, 31), randInt(0, 255), randInt(1, 254));
      case 2: return fromOctets(192, 168, randInt(0, 255), randInt(1, 254));
      default: {
        let a;
        do { a = randInt(1, 223); } while (a === 10 || a === 127);
        return fromOctets(a, randInt(0, 255), randInt(0, 255), randInt(1, 254));
      }
    }
  }

  function checkIp(expected) {
    return (input) => parseIp(String(input)) === (expected >>> 0);
  }
  function checkNumber(expected) {
    return (input) => {
      const s = String(input).replace(/[,\s_]/g, '');
      return /^\d+$/.test(s) && Number(s) === expected;
    };
  }
  function checkCidr(expected) {
    return (input) => {
      const s = String(input).trim().replace(/^\/\s*/, '');
      return /^\d{1,2}$/.test(s) && Number(s) === expected;
    };
  }

  function makeQuestion(difficulty, focus) {
    const d = DIFFICULTY[difficulty] || DIFFICULTY.easy;
    const keys = Object.keys(TYPES);
    const type = TYPES[focus] ? focus : keys[randInt(0, keys.length - 1)];
    const cidr = randInt(d.cidr[0], d.cidr[1]);
    const ip = randomIp();
    const r = calculate(ip, cidr);
    const ipStr = `${intToIp(ip)}/${cidr}`;
    const q = { type, label: TYPES[type] };

    switch (type) {
      case 'network':
        q.prompt = `What is the network address of ${ipStr}?`;
        q.kind = 'ip'; q.answer = intToIp(r.network); q.check = checkIp(r.network);
        q.explain = explainRange(ip, cidr);
        break;
      case 'broadcast':
        q.prompt = `What is the broadcast address of ${ipStr}?`;
        q.kind = 'ip'; q.answer = intToIp(r.broadcast); q.check = checkIp(r.broadcast);
        q.explain = explainRange(ip, cidr);
        break;
      case 'firstHost':
        q.prompt = `What is the first usable host address in ${ipStr}?`;
        q.kind = 'ip'; q.answer = intToIp(r.first); q.check = checkIp(r.first);
        q.explain = explainRange(ip, cidr).concat(`First usable host = network address + 1 → ${intToIp(r.first)}`);
        break;
      case 'lastHost':
        q.prompt = `What is the last usable host address in ${ipStr}?`;
        q.kind = 'ip'; q.answer = intToIp(r.last); q.check = checkIp(r.last);
        q.explain = explainRange(ip, cidr).concat(`Last usable host = broadcast address − 1 → ${intToIp(r.last)}`);
        break;
      case 'usableHosts': {
        const h = 32 - cidr;
        q.prompt = `How many usable host addresses are in a /${cidr} subnet?`;
        q.kind = 'number'; q.answer = r.usable.toLocaleString('en-US'); q.check = checkNumber(r.usable);
        q.explain = [
          `Host bits = 32 − ${cidr} = ${h}.`,
          `Total addresses = 2^${h} = ${r.total.toLocaleString('en-US')}.`,
          `Subtract 2 (network + broadcast) → ${r.usable.toLocaleString('en-US')} usable hosts.`
        ];
        break;
      }
      case 'maskForCidr':
        q.prompt = `Write /${cidr} as a dotted-decimal subnet mask.`;
        q.kind = 'ip'; q.answer = intToIp(r.mask); q.check = checkIp(r.mask);
        q.explain = explainMask(cidr);
        break;
      case 'cidrForMask':
        q.prompt = `What prefix length (CIDR) is the mask ${intToIp(r.mask)}?`;
        q.kind = 'cidr'; q.answer = `/${cidr}`; q.check = checkCidr(cidr);
        q.explain = explainMask(cidr).slice(0, 1).concat(
          `Count the 1-bits: ${cidr}. So the answer is /${cidr}.`,
          'Shortcut: each 255 is 8 bits; then 128=1, 192=2, 224=3, 240=4, 248=5, 252=6, 254=7.'
        );
        break;
      case 'hostsNeeded': {
        const n = randInt(2, d.maxHosts);
        let bits = 2;
        while (Math.pow(2, bits) - 2 < n) bits++;
        const ans = 32 - bits;
        q.prompt = `A department needs ${n.toLocaleString('en-US')} usable host addresses. What is the smallest subnet (CIDR prefix) that fits?`;
        q.kind = 'cidr'; q.answer = `/${ans}`; q.check = checkCidr(ans);
        q.explain = [
          `You need ${n.toLocaleString('en-US')} hosts + 2 (network and broadcast) = ${(n + 2).toLocaleString('en-US')} addresses.`,
          `Smallest power of 2 that's ≥ ${(n + 2).toLocaleString('en-US')}: 2^${bits} = ${Math.pow(2, bits).toLocaleString('en-US')}` +
            (bits > 2 ? ` (2^${bits - 1} = ${Math.pow(2, bits - 1).toLocaleString('en-US')} is too small).` : '.'),
          `So you need ${bits} host bits → prefix = 32 − ${bits} = /${ans}, which gives ${(Math.pow(2, bits) - 2).toLocaleString('en-US')} usable hosts.`
        ];
        break;
      }
      case 'subnetCount': {
        const base = randInt(d.base[0], d.base[1]);
        const next = base + randInt(1, Math.min(8, 30 - base));
        const net = calculate(randomIp(), base).network;
        const borrowed = next - base;
        const count = Math.pow(2, borrowed);
        q.prompt = `You divide ${intToIp(net)}/${base} into /${next} subnets. How many subnets do you get?`;
        q.kind = 'number'; q.answer = count.toLocaleString('en-US'); q.check = checkNumber(count);
        q.explain = [
          `Going from /${base} to /${next} borrows ${next} − ${base} = ${borrowed} bit${borrowed > 1 ? 's' : ''} from the host portion.`,
          `Each borrowed bit doubles the number of subnets: 2^${borrowed} = ${count.toLocaleString('en-US')} subnets.`,
          `Each /${next} has ${Math.pow(2, 32 - next).toLocaleString('en-US')} addresses (${(Math.pow(2, 32 - next) - 2).toLocaleString('en-US')} usable).`
        ];
        break;
      }
      case 'sameSubnet': {
        const same = Math.random() < 0.5;
        let other;
        for (let tries = 0; tries < 5; tries++) {
          if (same) {
            other = r.network + randInt(1, r.total - 2);
          } else {
            const neighbor = r.broadcast + 1 <= 0xFFFFFFFF ? r.broadcast + 1 : r.network - r.total;
            other = neighbor + randInt(1, r.total - 2);
          }
          if ((other >>> 0) !== ip) break;
        }
        other = other >>> 0;
        const r2 = calculate(other, cidr);
        const isSame = r2.network === r.network;
        q.prompt = `Using a /${cidr} mask, are ${intToIp(ip)} and ${intToIp(other)} on the same subnet?`;
        q.kind = 'yesno'; q.answer = isSame ? 'Yes' : 'No';
        q.check = (input) => String(input).toLowerCase() === (isSame ? 'yes' : 'no');
        q.explain = [
          `Find the network address of each IP with /${cidr} (mask ${intToIp(r.mask)}).`,
          `${intToIp(ip)} → network ${intToIp(r.network)}`,
          `${intToIp(other)} → network ${intToIp(r2.network)}`,
          isSame ? 'Same network address → same subnet.' : 'Different network addresses → different subnets (traffic between them needs a router).'
        ];
        break;
      }
    }
    return q;
  }

  const api = {
    parseIp, intToIp, octet, cidrToMask, maskToCidr, toBinary, ipClass, addressType,
    parseInput, calculate, explainRange, explainMask, makeQuestion, TYPES, DIFFICULTY,
    prefixForHosts, freeBlocks, planSubnets
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Subnet = api;
})(typeof window !== 'undefined' ? window : this);
