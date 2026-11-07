import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'

interface Props extends HTMLMotionProps<'div'> {
  lift?: boolean   // lyfter lite när man håller musen över, standard när kortet går att klicka på
  flush?: boolean  // ingen inre marginal, t.ex. för bilder kant i kant
}

// Ett kort av frostat glas: halvgenomskinligt, suddar ut bakgrunden och har en tunn ljus kant.
// Utseendet finns i app.css under .glass.
export function GlassCard({ lift, flush, className, onClick, children, ...rest }: Props) {
  const still = useReducedMotion()
  const lifts = (lift ?? !!onClick) && !still
  const classes = ['glass', onClick && 'glass--interactive', flush && 'glass--flush', className].filter(Boolean).join(' ')

  return (
    <motion.div
      className={classes}
      onClick={onClick}
      whileHover={lifts ? { y: -4 } : undefined}
      whileTap={onClick && !still ? { scale: 0.99 } : undefined}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
