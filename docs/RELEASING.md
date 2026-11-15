# Releasing

Countersign is signed as an unlisted add-on, so it can be installed in release Firefox without being published.

## Steps

1. Bump `version` in `package.json`.
2. Run the gate. It must pass.

   ```sh
   npm run gate
   ```

3. Sign the build. Put your credentials in the `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` environment variables for this shell. Never write them in the repository, and never commit a `.env` file.

   ```sh
   npx web-ext sign --source-dir .output/firefox-mv3 --channel unlisted
   ```

4. Install the signed `.xpi` that `web-ext` writes to `web-ext-artifacts/`. In Firefox, open `about:addons`, choose the gear menu, then "Install Add-on From File".
5. Export your data before every update (Data page, Export). An export is the way back if an update goes wrong.

## Notes

- Credentials live only in your shell, or in an ignored `.env.local`. `.env.example` lists the variable names, not values.
- A signed add-on cannot be re-signed with the same version number. Bump the version first.
