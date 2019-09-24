import pygame

class snake():
    def __init__(self,screen,color,position,direction,cube_size):
        self.__myscreen = screen
        self.__mycolor = color
        self.__myposition = position
        self.__mydirection = direction
        self.__turns = []
        self.__cube_size = cube_size
      
    def drawSnake(self):
        pygame.draw.rect(self.__myscreen, self.__mycolor, [self.__myposition[0],self.__myposition[1],self.__cube_size,self.__cube_size], 0)

    def go(self, direction):
        if direction == 'down':
            self.__myposition[1] += self.__cube_size
            self.__mydirection = 'down'
        elif direction == 'up':
            self.__myposition[1] -= self.__cube_size
            self.__mydirection = 'up'
        elif direction == 'left':
            self.__myposition[0] -= self.__cube_size
            self.__mydirection = 'left'
        elif direction == 'right':
            self.__myposition[0] += self.__cube_size
            self.__mydirection = 'right'
    
    def setColor(self,color):
        self.__mycolor = color

    def setTurns(self,turn_list):
        self.__turns.append([[turn_list[0][0],turn_list[0][1]], turn_list[1]])        

    def getTurns(self):
        return self.__turns 
    def drop_first_turn(self):
        self.__turns.pop(0);

    def getColor(self):
        return self.__mycolor

    def getPosition(self):
        return self.__myposition
    def getDirection(self):
        return self.__mydirection
    
    
