// Post-build steps for GitHub Pages hosting of a client-side-routed SPA.
//
// 1) 404.html: GitHub Pages has no server-side rewrite, so a hard refresh or
//    deep link to a client route (e.g. /ppms/issues) would 404. Serving the
//    app shell as 404.html lets React Router take over and render the route.
// 2) .nojekyll: stop GitHub's Jekyll from touching the build output.
import { copyFileSync, writeFileSync } from 'node:fs'

copyFileSync('dist/index.html', 'dist/404.html')
writeFileSync('dist/.nojekyll', '')
console.log('postbuild: wrote dist/404.html and dist/.nojekyll')
