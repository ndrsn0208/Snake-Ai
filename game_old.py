# Copyright 2019, Anderson Wang
# July 21, 2019
import pygame
import snake as Snk
import cake
import sys
import random
import network
import numpy as np

#外挂系统
class game():
    def __init__(self):
        pygame.init()
        rndway = random.choice(['left','right','up','down']) 
        ##################
        ## Ai Settings ##
        #################
        self.neural_network = network.Network([9,16,3])
        self.evolution_moves = 600
        self.generation = 0
        self.individual = 0
        self.fitness = 0

        #####################
        ## Regular Settings##
        self.clock = pygame.time.Clock()   
        self.display_height = 400
        self.display_width = 400   
        self.screen = pygame.display.set_mode([self.display_width,self.display_height])     #游戏分辨率
        #self.background_color = [47,47,47] 
        self.background_color = [47, 56, 70]                  #背景颜色
        self.thisWay = rndway                             #初始方向
        self.n = 0
        self.HEADcolor = [245, 195, 58]                         #头的颜色
        self.color = [245, 195, 58]                           #蛇的颜色
        self.cube_size = 20                                  #色块的大小
        self.init_snake_head_height = int(random.randrange(0,self.display_height,self.cube_size))
        self.init_snake_head_width = int(random.randrange(0,self.display_width,self.cube_size))
        self.head = Snk.snake(self.screen,self.HEADcolor,[self.init_snake_head_width,self.init_snake_head_height], self.thisWay, self.cube_size)
        self.c = cake.cake(self.screen,self.cube_size)
        self.point = 0
        self.turn_pos = []
        self.movingRate = 90                                 #刷新率
        self.snake_list = [self.head]
        self.turn_index = 0
        self.input_value = np.array([0])
        self.score = 0
        self.previous_position = []
        self.ate_the_cake = False

        for i in range(0,5):
            if self.thisWay == 'right':
                s = Snk.snake(self.screen,[self.color[0]-self.n*(i+1),self.color[1]-self.n*(i+1),self.color[2]-self.n*(i+1)],[self.init_snake_head_width-(i+1)*self.cube_size, self.init_snake_head_height], self.thisWay,self.cube_size)#一开始有多少截
                self.snake_list.append(s)
            elif self.thisWay == 'left':
                s = Snk.snake(self.screen,[self.color[0]-self.n*(i+1),self.color[1]-self.n*(i+1),self.color[2]-self.n*(i+1)],[self.init_snake_head_width+(i+1)*self.cube_size, self.init_snake_head_height], self.thisWay,self.cube_size)#一开始有多少截
                self.snake_list.append(s)
            elif self.thisWay == 'up':
                s = Snk.snake(self.screen,[self.color[0]-self.n*(i+1),self.color[1]-self.n*(i+1),self.color[2]-self.n*(i+1)],[self.init_snake_head_width, self.init_snake_head_height+(i+1)*self.cube_size], self.thisWay,self.cube_size)#一开始有多少截
                self.snake_list.append(s)
            elif self.thisWay == 'down':
                s = Snk.snake(self.screen,[self.color[0]-self.n*(i+1),self.color[1]-self.n*(i+1),self.color[2]-self.n*(i+1)],[self.init_snake_head_width, self.init_snake_head_height-(i+1)*self.cube_size], self.thisWay,self.cube_size)#一开始有多少截
                self.snake_list.append(s)
#游戏开始
    def snake_moves(self):
        for snake in self.snake_list:
                if  snake.getTurns() == []:
                    snake.go(snake.getDirection())
                else:
                    if  snake.getPosition() == snake.getTurns()[self.turn_index][0]:
                        snake.go(snake.getTurns()[self.turn_index][1])
                        snake.drop_first_turn() 
                    else:
                        snake.go(snake.getDirection())

    def set_evolution_move(self,m):
        self.evolution_moves += m

    def sanke_grows(self):
        position = []
        last_snake_position = self.snake_list[-1].getPosition()
        last_sanke_dir = self.snake_list[-1].getDirection()

        last_snake_pos = [last_snake_position[0],last_snake_position[1]]
        #新建一段蛇
        if last_sanke_dir == 'up':
            position = [last_snake_pos[0],last_snake_pos[1]+self.cube_size]
        if last_sanke_dir == 'down':
            position = [last_snake_pos[0],last_snake_pos[1]-self.cube_size]
        if last_sanke_dir == 'left':
            position = [last_snake_pos[0]+self.cube_size,last_snake_pos[1]]
        if last_sanke_dir == 'right':
            position = [last_snake_pos[0]-self.cube_size,last_snake_pos[1]]
        #给新的蛇加上turn属性
        newSnake = Snk.snake(self.screen, [self.snake_list[-1].getColor()[0]-self.n,self.snake_list[-1].getColor()[1]-self.n,self.snake_list[-1].getColor()[2]-self.n], position, last_sanke_dir,self.cube_size)
        if self.snake_list[-1].getTurns() != []:
            for turn in self.snake_list[-1].getTurns():
                newSnake.setTurns(turn)
            #   print(self.snake_list[-1].getTurns())
        self.snake_list.append(newSnake)

    def display_new_cake(self):
        self.c.displayNEWCake()
        #判断新的蛋糕是不是在蛇体内生成
        count = 0
        gate = True
        while gate:
            gate = False
            for s in self.snake_list:
                if s.getPosition() == [self.c.left,self.c.top]:
                    self.c.displayNEWCake()
                    count += 1
                    gate = True
                elif (count == 0):
                    gate = False

    def listening_to_keyboard(self):
        event = pygame.event.poll()
        if event.type == pygame.QUIT:
            pygame.quit()
            exit()
        elif event.type == pygame.KEYDOWN:
            k = self.head.getPosition()
            if event.key == pygame.K_UP and self.head.getDirection() != 'down':
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_DOWN and self.head.getDirection() != 'up':
                self.thisWay = 'down'
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_LEFT and self.head.getDirection() != 'right':
                self.thisWay = 'left'
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif event.key == pygame.K_RIGHT and self.head.getDirection() != 'left':
                self.thisWay = 'right'
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])

    def snake_hits_itself(self):
        for s in self.snake_list:
            if self.head == s:
                pass
            elif self.head.getPosition() == s.getPosition():
                s.setColor([187,34,34])
                return True
        return False
    #判断蛇是不是撞墙了
    def snake_hits_the_wall(self):
        if ((self.head.getPosition()[0] < 0)\
            or (self.head.getPosition()[0]+self.cube_size > self.display_width)\
            or (self.head.getPosition()[1] < 0)\
            or (self.head.getPosition()[1]+self.cube_size > self.display_height)):
            #for s in self.snake_list:
            #    s.setColor([187,34,34])
            return True
        return False

    def is_food_to_my_left(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] < self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] > self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] > self.c.getPosition()[0]:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] < self.c.getPosition()[0]:
                return True
        return False

    def is_wall_to_my_left(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1]+self.cube_size == self.display_height:
                return True  
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] == 0:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] == 0:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0]+self.cube_size == self.display_width:
                return True
        return False
    
    def is_myself_to_my_left(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False      

    def is_food_to_my_right(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] > self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1] < self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0] < self.c.getPosition()[0]:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] > self.c.getPosition()[0]:
                return True
        return False
    
    def is_wall_to_my_right(self):
        if self.head.getDirection() == "left":
            if self.head.getPosition()[1] == 0:
                return True  
        elif self.head.getDirection() == "right":
            if self.head.getPosition()[1]+self.cube_size == self.display_height:
                return True
        elif self.head.getDirection() == "up":
            if self.head.getPosition()[0]+self.cube_size == self.display_width:
                return True
        elif self.head.getDirection() == "down":
            if self.head.getPosition()[0] == 0:
                return True
        return False

    def is_myself_to_my_right(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False 

    def is_food_in_front_of_me(self):
        if self.head.getDirection() == "left" or self.head.getDirection() == "right":
            if self.head.getPosition()[1] == self.c.getPosition()[1]:
                return True
        elif self.head.getDirection() == "up" or self.head.getDirection() == "down":
            if self.head.getPosition()[0] == self.c.getPosition()[0]:
                return True
        return False

    def is_wall_in_front_of_me(self):
        if (self.head.getPosition()[0] == 0) and (self.head.getDirection() == "left"):
            return True
        elif (self.head.getPosition()[0]+self.cube_size == self.display_width) and (self.head.getDirection() == "right"):    
            return True
        elif (self.head.getPosition()[1] == 0) and (self.head.getDirection() == "up"):
            return True
        elif (self.head.getPosition()[1]+self.cube_size == self.display_height) and (self.head.getDirection() == "down"):
            return True
        return False

    def is_myself_in_front_of_me(self):
        if self.head.getDirection() == "left":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]-self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "right":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0]+self.cube_size,self.head.getPosition()[1]] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "up":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]-self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True
        elif self.head.getDirection() == "down":
            for s in self.snake_list:
                if self.head == s:
                    pass
                elif [self.head.getPosition()[0],self.head.getPosition()[1]+self.cube_size] == [s.getPosition()[0],s.getPosition()[1]]:
                    return True 
        return False

    def get_current_status(self):
        input_list = []
        #LEFT
        if self.is_wall_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_to_my_left():
            input_list.append(1)
        else:
            input_list.append(0)
        #RIGHT
        if self.is_wall_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_to_my_right():
            input_list.append(1)
        else:
            input_list.append(0)
        #STRAIGHT
        if self.is_wall_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_myself_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        if self.is_food_in_front_of_me():
            input_list.append(1)
        else:
            input_list.append(0)
        
        return np.asarray(input_list)

    def ai_decided_direction(self,output):
        if output[0][0] == max(output[0][0],output[1][0],output[2][0]):
            k = self.head.getPosition()
            if self.head.getDirection() == "left":
                self.thisWay = 'down'        
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "right":
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "up":
                self.thisWay = 'left'        
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "down":
                self.thisWay = 'right'        
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
        elif output[1][0] == max(output[0][0],output[1][0],output[2][0]):
            k = self.head.getPosition()
            if self.head.getDirection() == "left":
                self.thisWay = 'up'        
                direction = 'up'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "right":
                self.thisWay = 'down'        
                direction = 'down'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "up":
                self.thisWay = 'right'        
                direction = 'right'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
            elif self.head.getDirection() == "down":
                self.thisWay = 'left'        
                direction = 'left'
                for snake in self.snake_list:
                    snake.setTurns([[k[0],k[1]], direction])
        elif output[2][0] == max(output[0][0],output[1][0],output[2][0]):
                self.thisWay = self.head.getDirection()
    
    def fitness(self):
        return self.score
    
    def distence(self,position1, position2):
        return ((position1[0]-position2[0])**2+(position1[1]-position2[1])**2)**0.5
    
    def reward(self):
        if self.distence(self.head.getPosition(),self.c.getPosition()) < self.distence(self.previous_position,self.c.getPosition()):
            self.score += 1
        if self.distence(self.head.getPosition(),self.c.getPosition()) > self.distence(self.previous_position,self.c.getPosition()):
            self.score -= 1.5
        if self.ate_the_cake:
            self.score += 9
    
        if self.snake_hits_itself():
            self.score -= 1.3
        if self.snake_hits_the_wall():
            self.score -= 1.2   

    def display_info(self,generation,individual,fitness):
        self.generation = generation
        self.individual = individual
        self.fitness = fitness
        font1 = pygame.font.Font(None, 20)
        font2 = pygame.font.Font(None, 20)
        font3 = pygame.font.Font(None, 20)
        font4 = pygame.font.Font(None, 20)
        s1 = "Generation: "+str(generation)
        s2 = "Individual: "+str(individual)
        s3 = "Fitness: "+str(fitness)
        s4 = "Moves left: "+str(self.evolution_moves)
        info1 = font1.render(s1,1,(255,255,255))
        info2 = font2.render(s2,1,(255,255,255))
        info3 = font3.render(s3,1,(255,255,255))
        info4 = font4.render(s4,1,(255,255,255))
        textpos1 = [0,15] 
        textpos2 = [0,35]
        textpos3 = [0,56]
        textpos4 = [0,75]  
        self.screen.blit(info1,textpos1)
        self.screen.blit(info2,textpos2)
        self.screen.blit(info3,textpos3)
        self.screen.blit(info4,textpos4)

    def drawSnake(self):
        for snakes in self.snake_list:
            snakes.drawSnake() 

    def start(self):
        while True:
            self.screen.fill(self.background_color)
            self.c.displayCake()
            self.drawSnake()
            self.display_info(self.generation,self.individual,self.fitness)            
            self.previous_position = [self.head.getPosition()[0],self.head.getPosition()[1]]
    #ai
            self.input_value = self.get_current_status()
            new_input_value = self.input_value.reshape((len(self.get_current_status()),1))
            output = self.neural_network.feedforward(new_input_value).tolist()
            self.ai_decided_direction(output)
    #监听键盘事件
            self.listening_to_keyboard()
    #判断蛇头有没有撞到
            stop = False
            if self.snake_hits_the_wall():
                stop = True
                return self.neural_network.getWeights(), self.neural_network.getBiases(), self.score - self.evolution_moves
            if self.snake_hits_itself():
                stop = True
                return self.neural_network.getWeights(), self.neural_network.getBiases(), self.score - self.evolution_moves
            if self.evolution_moves == 0:
                return self.neural_network.getWeights(), self.neural_network.getBiases(), self.score + 13
    #蛇的操作系统
            if  not(stop):
                self.snake_moves()
                self.evolution_moves -= 1
                self.reward()
    #吃蛋糕
            if  self.head.getPosition() == [self.c.left,self.c.top]:
                self.point += 1
                self.ate_the_cake = True
                self.sanke_grows()
                self.display_new_cake()
            pygame.display.update()  
            self.clock.tick(self.movingRate)
            