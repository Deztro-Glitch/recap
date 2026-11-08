import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { api } from '../lib/api'

// Egen bakgrundsbild bakom glaset (vald under Inställningar). Ligger fast bakom allt, ovanpå ljusfläckarna,
// lite suddig och dämpad så att korten går att läsa. Tonar in när bilden har laddats.
export function PhotoBackdrop({ path }: { path: string | null }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!path) return setUrl(null)
    let cancelled = false
    api.fileUrls([path]).then((u) => {
      const src = u[path]
      if (!src || cancelled) return
      // Visa först när bilden är laddad, så att den inte ritas upp bit för bit.
      const img = new Image()
      img.onload = () => !cancelled && setUrl(src)
      img.src = src
    })
    return () => {
      cancelled = true
    }
  }, [path])

  useEffect(() => {
    const root = document.documentElement
    if (url) root.dataset.photo = ''
    else delete root.dataset.photo
    return () => void delete root.dataset.photo
  }, [url])

  return createPortal(
    <AnimatePresence>
      {url && (
        <motion.div
          key={url}
          className="photo-bg"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="photo-bg__img" style={{ backgroundImage: `url("${url}")` }} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
