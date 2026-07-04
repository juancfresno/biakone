// Home page module — just the shared tag marquee + lightbox.
import { initTags, destroyTags } from './tags.js'

export function init () { initTags() }
export function destroy () { destroyTags() }
