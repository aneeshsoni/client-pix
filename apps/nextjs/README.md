
## 👉 Get Started
The first time you clone the repo, run the following from the product root to install dependencies:
```
$ chmod +x init.sh start.sh npm-install.sh
$ ./init.sh
```

Update your `.env.local` file with values for each environment variable
```
API_KEY=AIzaSyBkkFF0XhNZeWuDmOfEhsgdfX1VBG7WTas
etc ...
```

Update packages and run the development server
```
./start.sh
```

To test out the Stripe Integration locally, open a new terminal window and start the webhook through the CLI below
```
stripe listen --forward-to localhost:3000/api/webhook/stripe
```

When the above command completes you'll be able to view your website at `http://localhost:3000`

## 🥞 Stack
This project uses the following libraries and services:
- Framework - [Next.js](https://nextjs.org)
- UI Kit - [Tailwind](https://tailwindcss.com)
- More UI - [ShadCN](https://ui.shadcn.com/)
- Authentication - [Clerk](https://clerk.com/)
- Database - [PostgreSQL](https://www.postgresql.org/)
- ORM - [Prisma + PostgreSQL Integration](https://www.prisma.io/docs/orm/overview/databases/postgresql)
- Payments - [Stripe](https://stripe.com)
- Hosting - TBD

## 📚 Guide

<details>
  <summary>
    <b>Styles</b>
  </summary>
  <p>
  Theme for the site created from <a href=https://ui.shadcn.com/themes> ShadCN Themes</a>

  Styles are applied within each component using Tailwind classes. You can customize your Tailwind colors, breakpoints, and other high-level values in
    <code>tailwind.config.js</code>
    (<a href="https://tailwindcss.com/docs/configuration">docs</a>).
  You can add new global classes in <code>src/styles/global.css</code> (<a href="https://tailwindcss.com/docs/adding-custom-styles#adding-component-classes">docs</a>). Your template contains Tailwind components designed by <a href="https://tailkit.com">Tailkit</a>. You can find a larger selection of nicely designed components at <a href="https://tailkit.com">tailkit.com</a>. 
  </p>
</details>

<details>
<summary><b>Authentication</b></summary>
<p>
  This project uses <a href="https://clerk.com/">Clerk</a> and includes Google, Apple and traditional Email + Password signin options.
</p>
</details>

<details>
<summary><b>Database & Prisma</b></summary>
<p>
  This project uses <a href="https://www.postgresql.org/">PostgreSQL</a> with <a href="https://www.prisma.io/">Prisma ORM</a> for type-safe database operations.

  <h4>🔄 Common Prisma Workflows:</h4>

  <b>When you change the schema (prisma/schema.prisma):</b>
  <pre><code># 1. Create and apply migration
npm run migrate:postgres-dev

# 2. Generate TypeScript types
npx prisma generate</code></pre>

  <b>Alternative approaches:</b>
  <pre><code># Quick development (no migration files)
npx prisma db push

# Production deployment (existing migrations only)
npm run migrate:postgres</code></pre>

  <b>When you get TypeScript errors after schema changes:</b>
  <pre><code>npx prisma generate</code></pre>

  <b>View your database (GUI):</b>
  <pre><code>npx prisma studio</code></pre>

  <b>Reset database (development only - deletes all data!):</b>
  <pre><code>npm run migrate:postgres-reset</code></pre>

  <b>Deploy to production:</b>
  <pre><code>npm run migrate:postgres</code></pre>

  <h4>📝 Typical Development Flow:</h4>
  <ol>
    <li>Edit <code>prisma/schema.prisma</code> (add/modify models)</li>
    <li>Run <code>npm run migrate:postgres-dev</code> (creates migration + applies to DB)</li>
    <li>Run <code>npx prisma generate</code> (updates TypeScript types)</li>
    <li>Update your code to use new fields/models</li>
  </ol>

  <h4>❓ When Do You Need Migrations?</h4>
  <p><b>Simple Rule:</b> Did you change <code>schema.prisma</code>? → Need migration</p>
  
  <b>✅ Migration Needed:</b>
  <ul>
    <li>Adding new fields to models</li>
    <li>Changing field types (Int → Decimal)</li>
    <li>Adding new models/tables</li>
    <li>Changing relationships</li>
    <li>Renaming or deleting fields</li>
  </ul>

  <b>❌ No Migration Needed:</b>
  <ul>
    <li>Just reading/writing data</li>
    <li>Code-only changes (functions, logic)</li>
    <li>Environment variable changes</li>
    <li>UI/styling updates</li>
  </ul>

  <h4>🔍 What Migrations Do:</h4>
  <p>Migrations create SQL files that update your database structure to match your schema. They ensure your database and code stay in sync across different environments and team members.</p>

  <h4>🔄 Migration Commands Explained:</h4>
  
  <b>prisma migrate dev</b> (Development)
  <ul>
    <li>✅ Creates new migration files</li>
    <li>✅ Applies migrations to local database</li>
    <li>⚠️ Resets database if conflicts occur</li>
    <li>🎯 Use: Local development, schema changes</li>
  </ul>

  <b>prisma migrate deploy</b> (Production)
  <ul>
    <li>✅ Applies existing migrations</li>
    <li>❌ Never creates new migrations</li>
    <li>❌ Never resets database</li>
    <li>🎯 Use: Production/staging deployment</li>
  </ul>

  <b>prisma db push</b> (Quick Development)
  <ul>
    <li>✅ Directly pushes schema to database</li>
    <li>❌ No migration files created</li>
    <li>⚠️ Overwrites database structure</li>
    <li>🎯 Use: Quick prototyping, no migration history needed</li>
  </ul>
</p>
</details>

<details>
<summary><b>Deployment</b></summary>
<p>
This project wasn't setup with a specific web host in mind. Please follow the Next.js <a href="https://nextjs.org/docs/deployment">deployment docs</a> to learn how to deploy your project to various hosts.
</p>
</details>