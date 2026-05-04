import {
  GiSoccerBall, GiBasketballBall, GiTennisBall, GiVolleyballBall,
  GiCricketBat, GiBaseballBat, GiAmericanFootballBall, GiGolfFlag,
  GiBoxingGlove, GiRunningShoe, GiSwimfins, GiCycling,
  GiTrophy, GiTargeting, GiWeightLiftingUp, GiWeightLiftingDown,
} from 'react-icons/gi'
import { Target } from 'lucide-react'

const SPORT_ICONS = {
  athletics:     GiRunningShoe,
  swimming:      GiSwimfins,
  cycling:       GiCycling,
  football:      GiSoccerBall,
  basketball:    GiBasketballBall,
  tennis:        GiTennisBall,
  volleyball:    GiVolleyballBall,
  cricket:       GiCricketBat,
  baseball:      GiBaseballBat,
  rugby:         GiAmericanFootballBall,
  golf:          GiGolfFlag,
  boxing:        GiBoxingGlove,
  wrestling:     GiWeightLiftingUp,
  gymnastics:    GiWeightLiftingDown,
  tournament:    GiTrophy,
  'multi-sport': GiTrophy,
  other:         GiTargeting,
}

export function SportIcon({ sport, size = 24, className = '' }) {
  const Icon = SPORT_ICONS[sport] || GiTargeting
  return <Icon size={size} className={className} />
}

export function PositionBadge({ position, className = '' }) {
  if (!position) return <span className={`text-slate-500 ${className}`}>—</span>
  const colors = { 1: 'text-yellow-400', 2: 'text-slate-300', 3: 'text-orange-400' }
  const color = colors[position] || 'text-slate-400'
  return <span className={`font-bold ${color} ${className}`}>#{position}</span>
}
