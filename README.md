# Multiple Window 3D Scene

This project demonstrates a 3D scene rendered with Three.js that is synchronized across multiple browser windows. It uses the Web Storage API (`localStorage`) to manage and share the state, position, and size of each window, creating the illusion of a single, contiguous 3D space.

## Features

- Real-time 3D scene synchronization across multiple browser windows.
- Dynamic window management for adding and removing windows from the shared scene.
- State synchronization using `localStorage` and the `storage` event.
- Smooth animated transitions for window movements and resizing.
- An object in the 3D scene corresponding to each open window.

## Installation

No installation is required. Simply clone the repository and open the `index.html` file in a web browser.

```bash
git clone https://github.com/bgstaal/multipleWindow3dScene.git
cd multipleWindow3dScene
```

Then, open `index.html` in your browser.

## Usage

Open `index.html` in your browser. To see the multi-window effect, open the same `index.html` file in several new browser windows and arrange them on your screen. A new cube will appear in the 3D scene for each window you open. Moving or resizing any window will update the scene in all other windows in real-time.

To reset the window state stored in `localStorage`, you can append a query parameter to the URL:
`file:///path/to/your/clone/index.html?clear=true`

## How It Works

The application's logic is split between two main JavaScript files: `WindowManager.js` and `main.js`.

### `WindowManager.js`

This class is the core of the multi-window management system.

- **Initialization**: When a window is opened, `WindowManager.init()` is called. It retrieves the current list of windows from `localStorage`, assigns a new unique ID to the current window, and adds it to the list along with its dimensions (`shape`) and any custom metadata.
- **State Synchronization**: The entire list of windows is stored as a JSON string in `localStorage` under the key `"windows"`. Any change to this list (adding, removing, or moving a window) triggers an update to `localStorage`.
- **Event Listening**:
  - An event listener for `storage` detects when `localStorage` is modified by another window. This allows each window to react to changes in the overall state.
  - An event listener for `beforeunload` ensures that a window is cleanly removed from the `localStorage` list when it is closed.
- **Update Loop**: The `update()` method is called continuously to check if the current window's position or size has changed. If it has, the window's `shape` data is updated in `localStorage`, propagating the change to all other open windows.

### `main.js`

This script handles the Three.js scene setup and rendering.

- **Scene Setup**: It initializes a Three.js scene with an orthographic camera. An `Object3D` container named `world` is created to hold all scene objects. This `world` object is offset to simulate the camera moving across the shared space.
- **Window Callbacks**: It sets up callbacks with the `WindowManager` to be notified when the list of windows changes (`windowsUpdated`) or when the current window's shape changes (`updateWindowShape`).
- **Object Management**: The `windowsUpdated` function synchronizes the 3D objects (cubes) with the list of windows. It removes all existing cubes and creates a new one for each window present in the `WindowManager`. The position of each cube corresponds to the center of its respective window.
- **Render Loop**: The `render()` function is called on every frame.
  - It calls `windowManager.update()` to check for and broadcast any changes to the current window's shape.
  - It smoothly interpolates the scene's position (`sceneOffset`) towards its target, creating a fluid movement effect when a window is moved.
  - It updates the position and rotation of each cube, ensuring they stay centered within their corresponding windows, even during movement.

## File Structure

- `index.html`: The main HTML file that contains the canvas for the Three.js renderer.
- `main.js`: Sets up the Three.js scene, manages rendering, and integrates with the `WindowManager`.
- `WindowManager.js`: A class for managing and synchronizing the state of multiple browser windows using `localStorage`.

## License

This project is licensed under the MIT License.
