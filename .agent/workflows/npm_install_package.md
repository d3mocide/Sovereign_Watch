---
description: How to install npm packages for the frontend
---

# NPM Package Installation Workflow

> **CRITICAL**: The `node_modules` directory is volume-mounted from the container. Installing packages on the Windows host will cause binary incompatibility and path issues.

To install a new package (e.g. `axios` or `lodash`), you MUST run the command inside the `meshrf_dev` container.

1.  **Identify the package name**.
2.  **Run the install command via Docker**:

    ```powershell
    docker exec sovereign-frontend npm install <package_name>
    ```

    _Append flags like `-D` or `--save` as needed._

3.  **Restart the container** (Optional but recommended for build plugins):

    ```powershell
    docker restart sovereign-frontend
    ```
