# Design Wrapper

A visual AI editor for React applications

## Setup

1. [Optional] Create a React app, if you don't have one already.

   ```
   cd ~
   npm create vite@latest my-react-app -- --template react
   ```

2. Edit `serve-react/.env` with the path to the main React component.

   1. `TARGET_APP_PATH` is the absolute path to the React project (e.g. `/Users/jane/my-react-app`)
   2. `TARGET_APP_ENTRY_POINT` is the relative path to the file containing your main component (e.g. `src/App.jsx`)

3. Start the agent server in one terminal.

   ```
   cd agent-server/
   npm install
   npm start
   ```

4. Start the React app server in another terminal.

   ```
   cd serve-react/
   npm install
   npm start
   ```

5. Start the Design Wrapper front-end in another terminal.

   ```
   cd visual-designer/
   npm install
   npm start
   ```

6. Open http://localhost:5173 in your browser.

7. Start editing!