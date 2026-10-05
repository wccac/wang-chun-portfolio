/* Measure the real stop positions so the thread meets every node on every screen. */
(() => {
  const map = document.querySelector('.journey .map');
  if (!map) return;
  const svg = map.querySelector('.journey-route');
  const paths = [...svg.querySelectorAll('path')];
  const stops = [...map.querySelectorAll('.map-dot')];
  let frame = 0;
  const drawRoute = () => {
    const box = map.getBoundingClientRect();
    if (!box.width || !box.height) return;
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    const points = stops.map(dot => {
      const rect = dot.getBoundingClientRect();
      return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top };
    });
    const mobile = matchMedia('(max-width: 720px)').matches;
    let d = `M ${points[0].x} ${points[0].y}`;
    points.slice(1).forEach((point, index) => {
      const previous = points[index];
      if (mobile) {
        const gap = point.y - previous.y;
        const sway = Math.min(25, previous.x * .6);
        d += ` C ${previous.x - sway} ${previous.y + gap * .36}, ${point.x + sway} ${point.y - gap * .36}, ${point.x} ${point.y}`;
      } else {
        const gap = point.x - previous.x;
        const arc = box.height * .13;
        d += index === 0
          ? ` C ${previous.x + gap * .35} ${previous.y - arc}, ${point.x - gap * .34} ${point.y + arc}, ${point.x} ${point.y}`
          : ` C ${previous.x + gap * .34} ${previous.y - arc}, ${point.x - gap * .35} ${point.y - arc}, ${point.x} ${point.y}`;
      }
    });
    paths.forEach(path => path.setAttribute('d', d));
  };
  const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(drawRoute); };
  new ResizeObserver(schedule).observe(map);
  document.fonts.ready.then(schedule);
  schedule();
})();
