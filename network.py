import numpy as np
import random

class Network(object):

    def __init__(self, sizes):

        self.num_layers = len(sizes)
        self.sizes = sizes
        self.biases = [np.random.randn(y, 1) for y in sizes[1:]]
        self.weights = [np.random.randn(y, x)
                        for x, y in zip(sizes[:-1], sizes[1:])]

    def feedforward(self, a):
        """Return the output of the network if ``a`` is input."""
        for b, w in zip(self.biases, self.weights):
            a = sigmoid(np.dot(w, a)+b)
        return a
    
    def getWeights(self):
        return self.weights
    
    def getBiases(self):
        return self.biases
    
    def setWeights(self, w):
        self.weights = w
    
    def setBiases(self, b):
        self.biases = b

def sigmoid(z):
    return 1.0/(1.0+np.exp(-z))
