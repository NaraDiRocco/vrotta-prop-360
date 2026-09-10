/* El sitio es contenido: se lee entero sin JavaScript. Lo unico que necesita
   script es el recorrido 360, que vive en su propia app (`@r360/viewer`) y se
   embebe en un iframe. La URL se resuelve aca y no en el marcado para que
   cambie por entorno sin tocar el HTML. */

const TOUR_URL = import.meta.env.VITE_TOUR_URL ?? 'http://localhost:5183/'

const marco = document.querySelector<HTMLIFrameElement>('iframe[data-tour]')

if (marco) {
  // El recorrido pesa (52 MB de tiles): no tiene sentido descargarlo si el
  // visitante nunca baja hasta esa seccion. Se carga cuando se acerca.
  const observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        if (!entrada.isIntersecting) continue
        marco.src = TOUR_URL
        observador.disconnect()
      }
    },
    { rootMargin: '400px' },
  )

  observador.observe(marco)
}
