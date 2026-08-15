'use client';

import { useEffect, useRef } from 'react';

/**
 * A rotating faceted crystal rendered with Three.js, lit in the brand blue and
 * violet. Loaded client-only (three is imported inside the effect so it never
 * runs during SSR and stays out of the initial bundle). Performance guarded:
 * pixel ratio is capped, the loop pauses when the tab is hidden or the element
 * scrolls out of view, and honours prefers-reduced-motion.
 */
export default function HeroScene() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import('three');
      if (disposed) return;

      const width = mount.clientWidth || 460;
      const height = mount.clientHeight || 460;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
      camera.position.set(0, 0, 5);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0);
      mount.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      const group = new THREE.Group();
      scene.add(group);

      const geometry = new THREE.IcosahedronGeometry(1.4, 1);
      const material = new THREE.MeshStandardMaterial({
        color: 0x162041,
        emissive: 0x1a2450,
        metalness: 0.45,
        roughness: 0.25,
        flatShading: true,
      });
      const crystal = new THREE.Mesh(geometry, material);
      group.add(crystal);

      const wireframe = new THREE.LineSegments(
        new THREE.WireframeGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0x6d8bff, transparent: true, opacity: 0.35 }),
      );
      wireframe.scale.setScalar(1.02);
      group.add(wireframe);

      scene.add(new THREE.AmbientLight(0x334066, 0.7));
      const blue = new THREE.PointLight(0x3b6feb, 90, 40);
      blue.position.set(4, 3, 5);
      scene.add(blue);
      const violet = new THREE.PointLight(0x7c3aed, 80, 40);
      violet.position.set(-5, -2, 3);
      scene.add(violet);
      const rim = new THREE.DirectionalLight(0xbcd0ff, 0.6);
      rim.position.set(-2, 4, -3);
      scene.add(rim);

      const target = { x: 0, y: 0 };
      const current = { x: 0, y: 0 };
      function onPointer(e: PointerEvent) {
        const rect = renderer.domElement.getBoundingClientRect();
        target.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
        target.y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      }
      window.addEventListener('pointermove', onPointer);

      function onResize() {
        const w = mount!.clientWidth || width;
        const h = mount!.clientHeight || height;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
      window.addEventListener('resize', onResize);

      let visible = true;
      const io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
        },
        { threshold: 0 },
      );
      io.observe(mount);

      let raf = 0;
      const clock = new THREE.Clock();
      function frame() {
        raf = requestAnimationFrame(frame);
        if (!visible || document.hidden) return;
        const dt = clock.getDelta();
        if (!reduce) {
          group.rotation.y += dt * 0.35;
          group.rotation.x += dt * 0.08;
        }
        current.x += (target.x - current.x) * 0.05;
        current.y += (target.y - current.y) * 0.05;
        group.rotation.y += current.x * 0.006;
        group.rotation.x += current.y * 0.006;
        camera.position.x = current.x * 0.5;
        camera.position.y = -current.y * 0.5;
        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
      }
      frame();

      cleanup = () => {
        cancelAnimationFrame(raf);
        io.disconnect();
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('resize', onResize);
        geometry.dispose();
        material.dispose();
        wireframe.geometry.dispose();
        (wireframe.material as { dispose(): void }).dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement);
        }
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      aria-hidden
      style={{ width: '100%', aspectRatio: '1 / 1', minHeight: 300 }}
    />
  );
}
