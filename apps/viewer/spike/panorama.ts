/**
 * Equirectangular sintético 2:1 generado en canvas.
 * No descargamos nada de internet: el spike tiene que poder correr offline y
 * en CI. La grilla con marcas de yaw/pitch además permite verificar a ojo que
 * los polígonos caen donde dice la geometría.
 */
export function makeSyntheticPanorama(width = 4096): string {
  const height = width / 2;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d')!;

  // Cielo → horizonte → suelo, para tener referencia vertical.
  const grad = g.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.0, '#0a1a2f');
  grad.addColorStop(0.48, '#2b6ea8');
  grad.addColorStop(0.52, '#6b5a3e');
  grad.addColorStop(1.0, '#1c1610');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);

  // Damero de 15° x 15° para percibir el movimiento (si todo es liso, el ojo
  // no distingue 60 fps de 20 fps y el spike no sirve de nada).
  const cell = width / 24;
  for (let i = 0; i < 24; i++) {
    for (let j = 0; j < 12; j++) {
      if ((i + j) % 2) continue;
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(i * cell, j * cell, cell, cell);
    }
  }

  // Meridianos cada 15° con etiqueta de yaw en grados (0 = centro de la imagen).
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let deg = -180; deg < 180; deg += 15) {
    const x = ((deg + 180) / 360) * width;
    g.strokeStyle = deg === 0 ? 'rgba(255,80,80,.9)' : 'rgba(255,255,255,.22)';
    g.lineWidth = deg === 0 ? 5 : 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, height);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = `${Math.round(width / 130)}px sans-serif`;
    g.fillText(`${deg}°`, x, height * 0.5 - width / 90);
  }

  // Paralelos cada 15° con etiqueta de pitch.
  for (let deg = -75; deg <= 75; deg += 15) {
    const y = (0.5 - deg / 180) * height;
    g.strokeStyle = deg === 0 ? 'rgba(255,255,255,.75)' : 'rgba(255,255,255,.18)';
    g.lineWidth = deg === 0 ? 4 : 2;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillText(`${deg}°`, width * 0.25, y - width / 160);
  }

  return c.toDataURL('image/jpeg', 0.82);
}
