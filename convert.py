# depth of the generated octree
level_count = 8

# number of blocks to split to dataset into in each dimension
blocks_x = int(8)
blocks_y = int(8)
blocks_z = int(8)

# dataset coordinate extent in each dimension
# it is assumed that the lower coordinate bound is 0
dataset_size_x = float(35000.0)
dataset_size_y = float(35000.0)
dataset_size_z = float(35000.0)

# path to folder with dataset files
path = "dataset/tng50-4-0/"

# prefix of dataset filenames, number changes based on snapshot in time
prefix = "snap_000."

from scipy.interpolate import LinearNDInterpolator, NearestNDInterpolator
import numpy as np
import h5py
import datetime

count = 2**(level_count-1)
def calculateLevelAt(level, x, y, z):
    for ox in range(0,2):
        for oy in range(0,2):
            for oz in range(0,2):
                data[level][x, y, z] += data[level+1][2*x+ox, 2*y+oy, 2*z+oz]
vCalculateLevelAt = np.vectorize(calculateLevelAt, excluded=['level'], otypes=[])
def calculateLevel(level):
    x = np.array(range(0,2**level))
    y = np.array(range(0,2**level))
    z = np.array(range(0,2**level))
    X,Y,Z = np.meshgrid(x,y,z)
    vCalculateLevelAt(level, X.flatten(), Y.flatten(), Z.flatten())
    data[level] /= 8.0

def calculateErrorAt(level, x, y, z):
    sub = 0.0
    for ox in range(0,2):
        for oy in range(0,2):
            for oz in range(0,2):
                error[level][x, y, z] += np.abs(data[level][x,y,z] - data[level+1][2*x+ox, 2*y+oy, 2*z+oz])
                sub += error[level+1][2*x+ox, 2*y+oy, 2*z+oz] # sum lower errors
    error[level][x, y, z] += sub
vCalculateErrorAt = np.vectorize(calculateErrorAt, excluded=['level'], otypes=[])
def calculateError(level):
    x = np.array(range(0,2**level))
    y = np.array(range(0,2**level))
    z = np.array(range(0,2**level))
    X,Y,Z = np.meshgrid(x,y,z)
    vCalculateErrorAt(level, X.flatten(), Y.flatten(), Z.flatten())

all_coordinates = np.empty((0,3), dtype=np.float32)
all_density = np.empty((0), dtype=np.float32)

for i in range(0, 11):
    name = prefix + str(i)
    f = h5py.File(path + name + ".hdf5")
    part = f['PartType0']
    all_density = np.concatenate((all_density, part['Density']), dtype=np.float32)
    all_coordinates = np.concatenate((all_coordinates, part['Coordinates']), dtype=np.float32)

for i in np.linspace(0, blocks_x - 1, blocks_x):
    for j in np.linspace(0, blocks_y - 1, blocks_y):
        for k in np.linspace(0, blocks_z - 1, blocks_z):
            print(i, j, k, datetime.datetime.now())
            
            min = np.array([i * dataset_size_x/float(blocks_x), j * dataset_size_y/float(blocks_y), k * dataset_size_z/float(blocks_z)], dtype=np.float32)
            max = np.array([(i+1.0) * dataset_size_x/float(blocks_x), (j+1.0) * dataset_size_y/float(blocks_y), (k+1.0) * dataset_size_z/float(blocks_z)], dtype=np.float32)
            size = max - min
            
            indices = np.all((all_coordinates > min - size / 2.0) & (all_coordinates < max + size / 2.0), axis=1)
            coordinates = all_coordinates[indices]
            density = all_density[indices]
            
            (x, x_step) = np.linspace(min[0], max[0], count, retstep=True)
            (y, y_step) = np.linspace(min[1], max[1], count, retstep=True)
            (z, z_step) = np.linspace(min[2], max[2], count, retstep=True)
            X, Y, Z = np.meshgrid(x+0.5*x_step, y+0.5*y_step, z+0.5*z_step)
            
            linear = LinearNDInterpolator(coordinates, density, fill_value=0)
            
            lowest = linear(X, Y, Z)
            
            data = [np.zeros((2**level, 2**level, 2**level), dtype=np.float32) for level in range(0, level_count)]
            data[level_count-1] = lowest;
            
            
            for l in reversed(range(0, level_count-1)):
                calculateLevel(l)
            
            error = [np.zeros((2**level, 2**level, 2**level), dtype=np.float32) for level in range(0, level_count)]
            
            for l in reversed(range(0, level_count-1)):
                calculateError(l)

            file = open(f"layered{int(i):02d}{int(j):02d}{int(k):02d}.bin", 'wb')
            
            # depth
            level_count_to_write = np.array([level_count], dtype='uint32')
            file.write(level_count_to_write.tobytes())
            
            # cube bounds
            file.write(min.astype(np.float32).tobytes())
            file.write(max.astype(np.float32).tobytes())
            
            # scalar data
            for l in range(0, level_count):
                file.write(data[l].astype(np.float32).tobytes())
            
            # error
            # the final level doesn't need an error
            for l in range(0, level_count-1):
                file.write(error[l].astype(np.float32).tobytes())
            file.close()
