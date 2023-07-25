# tng-viz

## setup
Install Python 3 and the Python packages NumPy, SciPy and h5py.
Install Node.js.
Run ```npm install``` in the repository folder to automatically install javascript dependencies.

Get a dataset from https://www.tng-project.org/data/ and put it in a folder ```dataset```. For the TNG-50-4 dataset at timestep 0, the folder structure should be ```dataset/tng-50-4-0/snap_000.X.hdf5``` where X goes from 0 to 10.

Adjust the variables at the top of ```convert.py``` to point at the dataset files.
Run ```convert.py``` and wait for the conversion to complete. For the TNG-50-4 dataset at a single timestep, this will take a few hours. The TNG-50-3 datasets need multiple days for conversion.
Adjust the variables at the top of ```dataset.js``` to point to the converted dataset files. Adjust the block counts to correspond to the block counts set in ```convert.py```.

Run ```npx vite``` to start the server.
Use a web browser to connect to the server via the IP shown.


Move using WASD keys, and go up/down using Left Shift/Spacebar.

To rotate the camera, hold the left mouse button and move the mouse.

