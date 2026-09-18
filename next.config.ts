import type {NextConfig} from 'next';

const nextConfig:NextConfig={
  distDir:process.env.NEXT_DIST_DIR||'.next',
  reactStrictMode:true,
  poweredByHeader:false
};
export default nextConfig;
