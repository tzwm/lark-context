import 'dotenv/config'

const requiredEnvVars = ['LARK_APP_ID', 'LARK_APP_SECRET']
const missingVars: string[] = []

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    missingVars.push(envVar)
  }
}

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:')
  for (const v of missingVars) {
    console.error(`   - ${v}`)
  }
  console.error('\nPlease copy .env.example to .env and fill in the required values.')
  process.exit(1)
}

console.log('✅ Environment configuration is valid')
console.log('\nConfiguration:')
console.log(`   LARK_APP_ID: ${process.env.LARK_APP_ID?.substring(0, 8)}...`)
console.log(`   LARK_APP_SECRET: ${process.env.LARK_APP_SECRET?.substring(0, 8)}...`)
console.log(`   LARK_ENCRYPT_KEY: ${process.env.LARK_ENCRYPT_KEY ? '✓ Set' : '✗ Not set'}`)
console.log(
  `   LARK_VERIFICATION_TOKEN: ${process.env.LARK_VERIFICATION_TOKEN ? '✓ Set' : '✗ Not set'}`,
)
console.log(`   PORT: ${process.env.PORT || '3000'}`)
console.log('\n✅ All checks passed! You can now run: pnpm dev')
