import pygame
import random

class cake():
    def __init__(self, screen,cube_size):
        self.left = int(random.randrange(0,400,cube_size))
        self.top = int(random.randrange(0,400,cube_size))
        self.myscreen = screen
        self.__cube_size = cube_size
    
    def displayCake(self):
        pygame.draw.rect(self.myscreen, [140, 145, 156], [self.left,self.top,self.__cube_size,self.__cube_size], 0)
    
    def displayNEWCake(self):
        self.left = int(random.randrange(0,400,self.__cube_size))
        self.top = int(random.randrange(0,400,self.__cube_size))
        self.displayCake()
    
    def getPosition(self):
        return [self.left,self.top]