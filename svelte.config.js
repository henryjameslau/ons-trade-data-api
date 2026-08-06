import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      strict: false
    }),
    alias: {
      $lib: 'src/lib'
    },
    prerender: {
      handleHttpError: ({ path, referrer, message }) => {
        // Ignore missing favicon / static assets during prerender
        if (path.startsWith('/favicon') || path.startsWith('/apple-touch')) return;
        throw new Error(message);
      }
    }
  }
};

export default config;
